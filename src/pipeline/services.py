"""Shared service functions called by both REST and MCP surfaces.

This module is the single source of truth for all business operations.
Both the FastAPI endpoints and the MCP tools call these functions —
no separate logic paths exist.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Optional

from src.pipeline.approval import (
    ApprovalService,
    DecisionValue,
    InMemoryApprovalStore,
    ItemStatus,
    QueueItem,
)
from src.pipeline.config import load_config
from src.pipeline.deliverable import Deliverable
from src.pipeline.history import HistoryStore, RunHistory, get_run_history
from src.pipeline.resume import (
    ResumeFromBeginning,
    ResumeLockError,
    ResumeResult,
    ResumeStore,
    resume_run,
)
from src.pipeline.state import create_initial_state


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class CreateRunResult:
    run_id: str
    status: str
    error: Optional[str] = None


@dataclass
class RunStatusResult:
    run_id: str
    status: str
    resumed_from: Optional[str] = None
    next_node: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ApprovalListResult:
    run_id: str
    items: list[dict[str, Any]]
    total: int
    pending: int


@dataclass
class ApprovalDecisionResult:
    item_id: str
    decision: str
    success: bool
    error: Optional[str] = None


@dataclass
class DeliverableResult:
    sections: dict[str, Any]
    deliverable_hash: str


@dataclass
class HistoryResult:
    run_id: str
    entries: list[dict[str, Any]]
    total: int


# ---------------------------------------------------------------------------
# Store registry (dependency injection for both surfaces)
# ---------------------------------------------------------------------------


class ServiceRegistry:
    """Holds all store/service references for DI.

    Both the REST layer and MCP layer read from here.
    """

    def __init__(self) -> None:
        self.run_store: Optional[Any] = None
        self.resume_store: Optional[Any] = None
        self.history_store: Optional[Any] = None
        self.approval_service: Optional[ApprovalService] = None
        self.deliverable: Optional[Deliverable] = None

    def configure(
        self,
        run_store: Any = None,
        resume_store: Any = None,
        history_store: Any = None,
        approval_service: ApprovalService | None = None,
        deliverable: Deliverable | None = None,
    ) -> None:
        if run_store is not None:
            self.run_store = run_store
        if resume_store is not None:
            self.resume_store = resume_store
        if history_store is not None:
            self.history_store = history_store
        if approval_service is not None:
            self.approval_service = approval_service
        if deliverable is not None:
            self.deliverable = deliverable


# Singleton registry
registry = ServiceRegistry()


# ---------------------------------------------------------------------------
# Service functions — called by both REST and MCP
# ---------------------------------------------------------------------------


def create_run(
    document_id: str,
    document_version_id: str,
    config_overrides: dict | None = None,
) -> CreateRunResult:
    """Create a new pipeline run.

    Validates input, generates run_id, freezes config, persists the run row.
    """
    if not registry.run_store:
        return CreateRunResult(run_id="", status="error", error="Run store not configured")

    run_id = str(uuid.uuid4())

    try:
        config = load_config(config_overrides)
    except ValueError as e:
        return CreateRunResult(run_id="", status="error", error=str(e))

    if not registry.run_store.acquire_run_lock(run_id):
        return CreateRunResult(
            run_id="", status="error",
            error=f"Cannot create run {run_id}: lock already held",
        )

    # Build initial state (validates construction)
    create_initial_state(
        run_id=run_id,
        document_id=document_id,
        document_version_id=document_version_id,
        config=config,
    )

    registry.run_store.create_run(
        run_id=run_id,
        document_id=document_id,
        document_version_id=document_version_id,
        config_snapshot=dict(config),
    )

    return CreateRunResult(run_id=run_id, status="created")


def get_run_status(run_id: str) -> RunStatusResult:
    """Get the status of a pipeline run by resuming/checking checkpoint."""
    if not registry.resume_store:
        return RunStatusResult(run_id=run_id, status="error", error="Resume store not configured")

    try:
        result = resume_run(store=registry.resume_store, run_id=run_id)
    except ResumeLockError as e:
        return RunStatusResult(run_id=run_id, status="locked", error=str(e))

    if isinstance(result, ResumeFromBeginning):
        return RunStatusResult(
            run_id=run_id,
            status="pending",
            next_node=result.next_node,
        )

    return RunStatusResult(
        run_id=run_id,
        status="in_progress",
        resumed_from=result.resumed_from_step,
        next_node=result.next_node,
    )


def list_pending_approvals(run_id: str) -> ApprovalListResult:
    """List all pending approval items for a run."""
    if not registry.approval_service:
        return ApprovalListResult(run_id=run_id, items=[], total=0, pending=0)

    all_items = registry.approval_service.get_all(run_id)
    pending_count = sum(1 for i in all_items if i.status == ItemStatus.PENDING)

    items_data = [
        {
            "id": item.id,
            "run_id": item.run_id,
            "item_type": item.item_type,
            "payload": item.payload,
            "status": item.status.value,
            "queued_at": item.queued_at.isoformat(),
            "decided_at": item.decided_at.isoformat() if item.decided_at else None,
            "decision": item.decision.value if item.decision else None,
            "reviewer_id": item.reviewer_id,
            "justification": item.justification,
        }
        for item in all_items
    ]

    return ApprovalListResult(
        run_id=run_id,
        items=items_data,
        total=len(all_items),
        pending=pending_count,
    )


def decide_approval_item(
    item_id: str,
    decision: str,
    reviewer_id: str,
    justification: str,
) -> ApprovalDecisionResult:
    """Approve or reject a single approval queue item."""
    if not registry.approval_service:
        return ApprovalDecisionResult(
            item_id=item_id, decision=decision, success=False,
            error="Approval service not configured",
        )

    if decision not in ("approved", "rejected"):
        return ApprovalDecisionResult(
            item_id=item_id, decision=decision, success=False,
            error=f"Invalid decision: {decision}. Must be 'approved' or 'rejected'.",
        )

    decision_enum = DecisionValue(decision)
    result = registry.approval_service.decide(
        item_id=item_id,
        decision=decision_enum,
        reviewer_id=reviewer_id,
        justification=justification,
    )

    return ApprovalDecisionResult(
        item_id=result.item_id,
        decision=result.decision.value,
        success=result.success,
        error=result.error,
    )


def get_deliverable() -> DeliverableResult:
    """Get the current deliverable with all section hashes."""
    if not registry.deliverable:
        return DeliverableResult(sections={}, deliverable_hash="")

    registry.deliverable.compute_all_hashes()

    sections_data: dict[str, Any] = {}
    for key, section in registry.deliverable.sections.items():
        sections_data[key] = {
            "key": section.key,
            "content_hash": section.content_hash,
            "claims": [
                {
                    "claim_id": c.claim_id,
                    "claim_type": c.claim_type,
                    "extracted_text": c.extracted_text,
                    "confidence": c.confidence,
                    "source_document_id": c.source_document_id,
                    "citation_status": c.citation_status,
                }
                for c in section.claims
            ],
        }

    return DeliverableResult(
        sections=sections_data,
        deliverable_hash=registry.deliverable.deliverable_hash,
    )


def get_change_history(run_id: str) -> HistoryResult:
    """Get the full change history for a pipeline run."""
    if not registry.history_store:
        return HistoryResult(run_id=run_id, entries=[], total=0)

    history = get_run_history(store=registry.history_store, run_id=run_id)

    entries_data = [
        {
            "event_id": entry.event_id,
            "timestamp": entry.timestamp.isoformat(),
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "action": entry.action,
            "actor_id": entry.actor_id,
            "source_document_id": entry.source_document_id,
            "previous_state": entry.previous_state,
            "new_state": entry.new_state,
        }
        for entry in history.entries
    ]

    return HistoryResult(
        run_id=run_id,
        entries=entries_data,
        total=history.total,
    )
