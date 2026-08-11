"""Resumable pipeline executor with checkpoint-based skip-on-resume.

Executes a sequence of nodes, checkpointing each node's output state
after successful completion. On resume (same run_id, same store), skips
already-checkpointed nodes and continues from the next un-executed node.

Invariants enforced (see docs/invariants.md):
1. Never re-run a completed node's side effects on resume.
2. Never lose an in-flight decision.
3. Never leave a run in an ambiguous state if killed between transitions.

The executor accepts a `crash_after` parameter for testing that simulates
a process kill AFTER a node's checkpoint is durable but BEFORE the next
node begins (modeling the dangerous window between transitions).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Optional, Protocol

from src.pipeline.serialization import deserialize_state, serialize_state
from src.pipeline.state import PipelineState


class CrashAfterNode(Exception):
    """Simulates a process crash after a node's checkpoint is durable.

    Used in testing to verify resume correctness. Not raised in production.
    """

    pass


class ExecutorStore(Protocol):
    """Combined protocol for checkpoint writing and resume reading.

    Production implementations back onto SQLAlchemy/Postgres.
    Test implementations use in-memory dicts.
    """

    def create_step(self, run_id: str, step_name: str, step_order: int) -> None:
        """Insert a run_steps row with status='running'."""
        ...

    def write_checkpoint(
        self,
        run_id: str,
        step_name: str,
        step_order: int,
        output_state: dict[str, Any],
        status: str,
        ended_at: Any,
    ) -> None:
        """Update the run_steps row with state, status, ended_at atomically."""
        ...

    def get_last_checkpoint(self, run_id: str) -> Optional[dict[str, Any]]:
        """Return the highest step_order row with status completed/skipped.

        Returns dict with step_name, step_order, output_state, status
        or None if no checkpoint exists.
        """
        ...

    def mark_orphaned_running_as_failed(self, run_id: str) -> int:
        """Mark run_steps with status='running' and ended_at=NULL as 'failed'.

        Returns count of rows updated.
        """
        ...

    def acquire_run_lock(self, run_id: str) -> bool:
        """Try to acquire exclusive advisory lock. Returns True if acquired."""
        ...


class ResumableExecutor:
    """Executes a sequence of nodes with checkpoint-based resumability.

    On first run: executes all nodes sequentially from the beginning.
    On resume: skips already-checkpointed nodes, continues from next.

    Args:
        nodes: Ordered list of (node_name, node_callable) tuples defining
            the pipeline sequence.
        store: Checkpoint store implementing ExecutorStore protocol.
        crash_after: Optional node name — if set, raises CrashAfterNode
            AFTER that node's checkpoint is written (for testing only).
    """

    def __init__(
        self,
        nodes: list[tuple[str, Callable[[PipelineState], PipelineState]]],
        store: ExecutorStore,
        crash_after: Optional[str] = None,
    ) -> None:
        self.nodes = nodes
        self.store = store
        self.crash_after = crash_after

    def run(self, state: PipelineState) -> PipelineState:
        """Execute the pipeline with checkpoint-based resume.

        1. Acquire per-run_id lock (prevents double-execution of same run).
        2. Clean up orphaned 'running' rows from prior crash.
        3. Find the last durable checkpoint for this run_id.
        4. If a checkpoint exists, restore state from it and skip to the
           next un-executed node.
        5. Execute remaining nodes sequentially, checkpointing each.

        Args:
            state: Initial pipeline state (used for run_id and as starting
                state if no checkpoint exists).

        Returns:
            The final PipelineState after all nodes have executed.

        Raises:
            CrashAfterNode: If crash_after is set and the named node completes.
        """
        run_id = state["run_id"]

        # Acquire per-run_id lock if the store supports it (Invariant 4)
        lock_acquired = False
        if hasattr(self.store, "acquire_run_lock"):
            lock_acquired = self.store.acquire_run_lock(run_id)
            if not lock_acquired:
                # Another executor holds this run_id's lock — block until
                # it finishes, then proceed with resume logic (which will
                # skip already-checkpointed nodes).
                if hasattr(self.store, "_get_run_lock"):
                    run_lock = self.store._get_run_lock(run_id)
                    run_lock.acquire()  # blocking wait
                    lock_acquired = True

        try:
            # Invariant 3: clean up orphaned running rows from prior crash
            self.store.mark_orphaned_running_as_failed(run_id)

            # Determine resume point from last durable checkpoint
            last_checkpoint = self.store.get_last_checkpoint(run_id)
            start_index = 0

            if last_checkpoint is not None:
                # Restore state from checkpoint (Invariant 1: skip completed nodes)
                checkpointed_name = last_checkpoint["step_name"]
                state = deserialize_state(last_checkpoint["output_state"])

                for i, (name, _) in enumerate(self.nodes):
                    if name == checkpointed_name:
                        start_index = i + 1  # Resume AFTER the checkpointed node
                        break

            # If all nodes already checkpointed, return restored state
            if start_index >= len(self.nodes):
                return state

            # Execute from start_index onwards
            for step_order, (node_name, node_fn) in enumerate(
                self.nodes[start_index:], start=start_index + 1
            ):
                # Create step row (status='running') — marks intent
                self.store.create_step(run_id, node_name, step_order)

                # Execute the node
                state = node_fn(state)

                # Write checkpoint atomically (status='completed')
                self.store.write_checkpoint(
                    run_id=run_id,
                    step_name=node_name,
                    step_order=step_order,
                    output_state=serialize_state(state),
                    status=state["node_status"],
                    ended_at=datetime.now(timezone.utc),
                )

                # Test hook: simulate crash AFTER checkpoint is durable
                if self.crash_after == node_name:
                    raise CrashAfterNode(
                        f"Process crashed after {node_name} "
                        f"(checkpoint is durable)"
                    )

            return state
        finally:
            # Release per-run_id lock
            if lock_acquired and hasattr(self.store, "release_run_lock"):
                self.store.release_run_lock(run_id)
