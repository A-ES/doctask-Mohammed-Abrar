"""FastAPI router for pipeline run management.

Provides endpoints to create new pipeline runs, resume interrupted runs,
and query run history (backed by the audit_events table).
Uses dependency injection for the database layer to support testing without
a real database or LangGraph runtime.

Requirements: 6.3, 5.3
"""

import uuid
from dataclasses import asdict
from datetime import datetime
from typing import Any, Optional, Protocol

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.pipeline.config import load_config
from src.pipeline.history import HistoryStore, RunHistory, get_run_history
from src.pipeline.resume import (
    ResumeFromBeginning,
    ResumeLockError,
    ResumeResult,
    ResumeStore,
    resume_run,
)
from src.pipeline.state import create_initial_state


# --- Request/Response models ---


class RunStateResponse(BaseModel):
    """Current pipeline state for canvas visualization.

    Driven directly from the LangGraph checkpointer — the frontend polls
    this endpoint and derives all node statuses from it.
    """

    run_id: str
    current_node: str
    node_status: str  # "completed" | "skipped" | "error"
    completed_nodes: list[str]
    skipped_nodes: list[dict]  # [{node_name, reason}]
    retries: dict[str, int]
    error_type: str | None = None
    error_detail: str | None = None
    run_status: str  # "running" | "completed" | "failed" | "paused"


class CreateRunRequest(BaseModel):
    """Request body for creating a new pipeline run."""

    document_id: str = Field(..., min_length=1)
    document_version_id: str = Field(..., min_length=1)
    config_overrides: dict | None = None


class CreateRunResponse(BaseModel):
    """Response for a newly created pipeline run."""

    run_id: str
    status: str


class ResumeRunResponse(BaseModel):
    """Response for a resumed pipeline run."""

    run_id: str
    status: str
    resumed_from: str | None = None
    next_node: str | None = None


class RunStateResponse(BaseModel):
    """Current pipeline state for canvas visualization."""

    run_id: str
    current_node: str
    node_status: str  # "completed" | "skipped" | "error"
    completed_nodes: list[str]
    skipped_nodes: list[dict]  # [{node_name, reason}]
    retries: dict[str, int]
    error_type: str | None = None
    error_detail: str | None = None
    run_status: str  # "running" | "completed" | "failed" | "paused"


class HistoryEntryResponse(BaseModel):
    """A single event in run history."""

    event_id: str
    timestamp: str
    entity_type: str
    entity_id: str
    action: str
    actor_id: str
    source_document_id: str | None = None
    previous_state: dict[str, Any] | None = None
    new_state: dict[str, Any]


class RunHistoryResponse(BaseModel):
    """Complete ordered history for a pipeline run."""

    run_id: str
    entries: list[HistoryEntryResponse]
    total: int


# --- Database store protocol ---


class RunStore(Protocol):
    """Abstract protocol for run persistence operations.

    Implementations back onto SQLAlchemy sessions (production) or
    in-memory stores (testing).
    """

    def create_run(self, run_id: str, document_id: str, document_version_id: str, config_snapshot: dict) -> None:
        """Insert a new run row with frozen config snapshot."""
        ...

    def acquire_run_lock(self, run_id: str) -> bool:
        """Acquire advisory lock on run_id. Returns True if acquired."""
        ...

    def run_exists(self, run_id: str) -> bool:
        """Check if a run with the given ID exists."""
        ...


# --- Dependency injection ---


_run_store: Optional[Any] = None
_resume_store: Optional[Any] = None
_history_store: Optional[Any] = None


def set_run_store(store: Any) -> None:
    """Set the run store implementation (for testing/configuration)."""
    global _run_store
    _run_store = store


def set_resume_store(store: Any) -> None:
    """Set the resume store implementation (for testing/configuration)."""
    global _resume_store
    _resume_store = store


def set_history_store(store: Any) -> None:
    """Set the history store implementation (for testing/configuration)."""
    global _history_store
    _history_store = store


def get_run_store() -> Any:
    """Get the current run store implementation."""
    if _run_store is None:
        raise HTTPException(
            status_code=503,
            detail="Run store not configured",
        )
    return _run_store


def get_resume_store() -> Any:
    """Get the current resume store implementation."""
    if _resume_store is None:
        raise HTTPException(
            status_code=503,
            detail="Resume store not configured",
        )
    return _resume_store


def get_history_store() -> Any:
    """Get the current history store implementation."""
    if _history_store is None:
        raise HTTPException(
            status_code=503,
            detail="History store not configured",
        )
    return _history_store


# --- Router ---

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=CreateRunResponse)
def create_run(
    request: CreateRunRequest,
    store: Any = Depends(get_run_store),
) -> CreateRunResponse:
    """Create a new pipeline run.

    Validates input, generates a run_id (UUID), freezes configuration via
    load_config(overrides), builds initial state via create_initial_state(),
    and persists the run row. The actual graph invocation is deferred
    (will be async task in production).

    Acquires advisory lock on run_id at start to enforce single-writer.
    """
    # Generate run ID
    run_id = str(uuid.uuid4())

    # Freeze configuration with optional overrides
    try:
        config = load_config(request.config_overrides)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Acquire advisory lock
    if not store.acquire_run_lock(run_id):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot create run {run_id}: lock already held",
        )

    # Build initial state (validates that state construction works)
    initial_state = create_initial_state(
        run_id=run_id,
        document_id=request.document_id,
        document_version_id=request.document_version_id,
        config=config,
    )

    # Persist the run row with frozen config
    store.create_run(
        run_id=run_id,
        document_id=request.document_id,
        document_version_id=request.document_version_id,
        config_snapshot=dict(config),
    )

    return CreateRunResponse(run_id=run_id, status="created")


@router.post("/{run_id}/resume", response_model=ResumeRunResponse)
def resume_run_endpoint(
    run_id: str,
    store: Any = Depends(get_resume_store),
) -> ResumeRunResponse:
    """Resume a pipeline run from its last checkpoint.

    Calls resume_run which acquires an advisory lock, marks orphaned running
    rows as failed, restores state from last checkpoint, and determines the
    next node to execute.
    """
    try:
        result = resume_run(store=store, run_id=run_id)
    except ResumeLockError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if isinstance(result, ResumeFromBeginning):
        return ResumeRunResponse(
            run_id=run_id,
            status="resumed",
            resumed_from=None,
            next_node=result.next_node,
        )

    return ResumeRunResponse(
        run_id=run_id,
        status="resumed",
        resumed_from=result.resumed_from_step,
        next_node=result.next_node,
    )


@router.get("/{run_id}/history", response_model=RunHistoryResponse)
def get_run_history_endpoint(
    run_id: str,
    store: Any = Depends(get_history_store),
) -> RunHistoryResponse:
    """Get the full change history for a pipeline run.

    Returns an ordered list of all changes that occurred during this run,
    backed by the audit_events table. Each entry answers: what changed,
    when, and because of which source document.

    Events are returned in chronological order (oldest first).

    This does NOT reconstruct history from logs — it reads directly from
    the append-only audit trail populated during pipeline execution.
    """
    history = get_run_history(store=store, run_id=run_id)

    entries = [
        HistoryEntryResponse(
            event_id=entry.event_id,
            timestamp=entry.timestamp.isoformat(),
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            action=entry.action,
            actor_id=entry.actor_id,
            source_document_id=entry.source_document_id,
            previous_state=entry.previous_state,
            new_state=entry.new_state,
        )
        for entry in history.entries
    ]

    return RunHistoryResponse(
        run_id=run_id,
        entries=entries,
        total=history.total,
    )


@router.get("/{run_id}/state", response_model=RunStateResponse)
def get_run_state_endpoint(
    run_id: str,
    store: Any = Depends(get_resume_store),
) -> RunStateResponse:
    """Get the current pipeline state for canvas visualization.

    Returns the execution tracking fields from the last checkpoint,
    allowing the frontend to reconstruct the correct in-progress state
    even after a kill/restart.

    This reads directly from the checkpointer — no separate status store.
    """
    # Try to get the latest checkpoint state from the resume store
    try:
        state = store.get_latest_state(run_id)
    except Exception:
        # If no state available (run hasn't started), return initial state
        return RunStateResponse(
            run_id=run_id,
            current_node="",
            node_status="completed",
            completed_nodes=[],
            skipped_nodes=[],
            retries={},
            error_type=None,
            error_detail=None,
            run_status="paused",
        )

    # Determine run_status from state
    current_node = state.get("current_node", "")
    node_status = state.get("node_status", "completed")
    completed_nodes = state.get("completed_nodes", [])

    if "finalize" in completed_nodes:
        run_status = "completed"
    elif node_status == "error" and state.get("error_type") == "permanent":
        run_status = "failed"
    elif current_node == "human_review" and node_status == "completed":
        run_status = "paused"
    else:
        run_status = "running"

    skipped_nodes = [
        {"node_name": s["node_name"], "reason": s["reason"]}
        for s in state.get("skipped_nodes", [])
    ]

    return RunStateResponse(
        run_id=run_id,
        current_node=current_node,
        node_status=node_status,
        completed_nodes=completed_nodes,
        skipped_nodes=skipped_nodes,
        retries=state.get("retries", {}),
        error_type=state.get("error_type"),
        error_detail=state.get("error_detail"),
        run_status=run_status,
    )


@router.get("/{run_id}/state", response_model=RunStateResponse)
def get_run_state(
    run_id: str,
    store: Any = Depends(get_resume_store),
) -> RunStateResponse:
    """Get current pipeline run state for canvas visualization.

    Reconstructs execution state from the checkpoint store. After a kill/restart,
    this returns the persisted state so the frontend can re-render correctly.

    Returns 404 if the run doesn't exist, 503 if the store is unavailable.
    """
    # Use the resume store to look up run state from checkpoints
    try:
        state = store.get_run_state(run_id)
    except AttributeError:
        # Store doesn't implement get_run_state yet — return minimal state
        raise HTTPException(
            status_code=503,
            detail="Run state retrieval not yet implemented in store",
        )

    if state is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    # Determine run_status from state
    current_node = state.get("current_node", "")
    node_status = state.get("node_status", "completed")
    completed_nodes = state.get("completed_nodes", [])

    if node_status == "error":
        run_status = "failed"
    elif current_node == "" and len(completed_nodes) == 0:
        run_status = "paused"
    elif "finalize" in completed_nodes:
        run_status = "completed"
    else:
        run_status = "running"

    skipped_nodes = [
        {"node_name": entry["node_name"], "reason": entry["reason"]}
        for entry in state.get("skipped_nodes", [])
    ]

    return RunStateResponse(
        run_id=run_id,
        current_node=current_node,
        node_status=node_status,
        completed_nodes=completed_nodes,
        skipped_nodes=skipped_nodes,
        retries=state.get("retries", {}),
        error_type=state.get("error_type"),
        error_detail=state.get("error_detail"),
        run_status=run_status,
    )
