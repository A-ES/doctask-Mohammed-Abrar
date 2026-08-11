"""Thread-safe in-memory checkpoint store for concurrent execution testing.

Implements the ExecutorStore protocol with per-operation locking to simulate
the isolation guarantees that Postgres provides via row-level locking and
advisory locks in production.

Design choice: per-run_id scoping + threading.Lock on all store mutations.
This maps to Postgres `SELECT ... FOR UPDATE` per run_id in production.
Optimistic versioning was considered but rejected because:
- Our store operations are already scoped by run_id (natural isolation)
- The primary risk is torn reads/writes on shared Python dicts under threading
- A global store lock is simple, correct, and sufficient for the concurrency
  model (many runs, each sequential internally)

In production Postgres, this translates to:
- run_steps rows are naturally isolated by run_id (no cross-run contamination)
- pg_advisory_xact_lock(run_id) prevents double-execution of the same run
- Row-level locks on shared tables (documents, claims) serialize access
"""

from __future__ import annotations

import threading
from typing import Any, Optional


class ThreadSafeCheckpointStore:
    """Thread-safe in-memory store implementing the ExecutorStore protocol.

    All operations are serialized via a threading.Lock, ensuring that
    concurrent runs cannot interleave writes to the internal data structures.

    Per-run_id scoping is enforced: all queries filter on run_id, and the
    internal dict is keyed by (run_id, step_order) so cross-run contamination
    is structurally impossible.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # Keyed by (run_id, step_order) — natural per-run isolation
        self.steps: dict[tuple[str, int], dict[str, Any]] = {}
        # Per-run_id execution locks (simulates pg_advisory_lock)
        self._run_locks: dict[str, threading.Lock] = {}

    def _get_run_lock(self, run_id: str) -> threading.Lock:
        """Get or create a per-run_id lock (like pg_advisory_lock)."""
        with self._lock:
            if run_id not in self._run_locks:
                self._run_locks[run_id] = threading.Lock()
            return self._run_locks[run_id]

    # --- ExecutorStore protocol: checkpoint writing ---

    def create_step(self, run_id: str, step_name: str, step_order: int) -> None:
        """Insert a run_steps row with status='running'.

        Thread-safe: serialized via store lock.
        """
        with self._lock:
            key = (run_id, step_order)
            self.steps[key] = {
                "run_id": run_id,
                "step_name": step_name,
                "step_order": step_order,
                "status": "running",
                "output_state": None,
                "ended_at": None,
            }

    def write_checkpoint(
        self,
        run_id: str,
        step_name: str,
        step_order: int,
        output_state: dict[str, Any],
        status: str,
        ended_at: Any,
    ) -> None:
        """Atomically update the run_steps row with state and status.

        Thread-safe: serialized via store lock.
        """
        with self._lock:
            key = (run_id, step_order)
            if key not in self.steps:
                raise RuntimeError(
                    f"Step row not found: run_id={run_id}, step_order={step_order}"
                )
            self.steps[key]["output_state"] = output_state
            self.steps[key]["status"] = status
            self.steps[key]["ended_at"] = ended_at

    # --- ExecutorStore protocol: resume reading ---

    def get_last_checkpoint(self, run_id: str) -> Optional[dict[str, Any]]:
        """Return highest step_order row with completed/skipped status for run_id.

        Thread-safe: serialized via store lock.
        Scoped by run_id: only sees this run's rows.
        """
        with self._lock:
            candidates = [
                row
                for (rid, _), row in self.steps.items()
                if rid == run_id and row["status"] in ("completed", "skipped")
            ]
            if not candidates:
                return None
            return max(candidates, key=lambda r: r["step_order"])

    def mark_orphaned_running_as_failed(self, run_id: str) -> int:
        """Mark run_steps with status='running' and ended_at=NULL as 'failed'.

        Thread-safe: serialized via store lock.
        Scoped by run_id: only affects this run's rows.
        """
        with self._lock:
            count = 0
            for (rid, _), row in self.steps.items():
                if (
                    rid == run_id
                    and row["status"] == "running"
                    and row["ended_at"] is None
                ):
                    row["status"] = "failed"
                    count += 1
            return count

    def acquire_run_lock(self, run_id: str) -> bool:
        """Try to acquire exclusive per-run_id lock (non-blocking).

        Returns True if acquired, False if already held.
        Simulates pg_try_advisory_lock(run_id).
        """
        run_lock = self._get_run_lock(run_id)
        return run_lock.acquire(blocking=False)

    def release_run_lock(self, run_id: str) -> None:
        """Release the per-run_id lock."""
        run_lock = self._get_run_lock(run_id)
        try:
            run_lock.release()
        except RuntimeError:
            pass  # Already released
