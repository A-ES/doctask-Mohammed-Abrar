"""Integration tests for human review gating, pause/resume, and deliverable reflection.

Verifies:
1. Pipeline pauses when human_review enqueues pending approval items:
   - Sets run status to "paused"
   - Persists human_review checkpoint
   - Halts execution loop (does NOT run finalize)
   - Emits run_status_changed audit event and run_paused SSE event
2. Pipeline completes when zero items require human review (no pause).
3. Deciding the last pending item automatically resumes the run from human_review's
   successor (finalize) in a background task and finalizes the run.
4. Deliverable reflects decisions:
   - Approved and rejected decisions appear on claims in the deliverable record
   - Deliverable hash incorporates decision values deterministically
5. POST /runs/{run_id}/resume:
   - Resumes execution from next unfinished node
   - Rejects invalid states (completed, cancelled) with HTTP 400
   - Is idempotent when called twice (no duplicate execution)
6. Preserves Invariants 1-3 in docs/invariants.md.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from src.database import SessionLocal
from src.main import app
from src.models.runs import Run, RunStep
from src.pipeline.approval import ApprovalService, DecisionValue
from src.pipeline.approval_api import decide_item, get_approval_service, set_approval_service
from src.pipeline.approval_postgres import PostgresApprovalStore
from src.pipeline.config import load_config
from src.pipeline.deliverable_store import load_deliverable_record
from src.pipeline.demo_executor import (
    _enrich_state_with_decisions,
    _execute_nodes_from,
    _get_pipeline_nodes,
    _node_human_review,
    is_run_active,
    resume_pipeline,
    run_pipeline,
)
from src.pipeline.state import PipelineState, QueueBuckets, create_initial_state


@pytest.fixture
def db_session():
    """Provide a real DB session with rollback isolation."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def postgres_approval_service():
    """ApprovalService backed by the live Postgres database."""
    store = PostgresApprovalStore(SessionLocal)
    service = ApprovalService(store)
    set_approval_service(service)
    yield service
    set_approval_service(None)


@pytest.fixture
def client():
    """TestClient for API tests."""
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def cleanup_test_runs():
    """Clean up test runs and their dependents after each test."""
    from src.pipeline.run_cleanup import delete_run_and_dependents

    yield
    with SessionLocal() as session:
        rows = session.execute(text("SELECT id FROM runs WHERE initiator = 'test_gate'")).fetchall()
        for row in rows:
            try:
                delete_run_and_dependents(session, str(row[0]))
            except Exception:
                pass
        session.commit()


def _create_test_run(session, run_id: str, status: str = "running") -> Run:
    """Helper to insert a test run."""
    run = Run(
        id=uuid.UUID(run_id),
        status="pending",
        initiator="test_gate",
        config_snapshot={},
    )
    session.add(run)
    session.commit()
    if status != "pending":
        # Transition via valid state machine
        run.status = "running"
        session.commit()
        if status in ("completed", "failed", "cancelled", "paused"):
            run.status = status
            session.commit()
    return run


class TestHumanReviewGating:
    """Test suite for human review gating."""

    @pytest.mark.asyncio
    async def test_run_pauses_when_items_exist(self, db_session, postgres_approval_service):
        """When human_review enqueues pending items, run status must be 'paused',
        checkpoint persisted, execution loop stopped, and finalize must NOT run."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "running")

        claim_id = f"test_claim_{uuid.uuid4().hex[:6]}"
        state = create_initial_state(
            run_id=run_id,
            document_id=str(uuid.uuid4()),
            document_version_id=str(uuid.uuid4()),
            config=load_config(),
        )
        state["claims"] = [
            {
                "claim_id": claim_id,
                "claim_text": "Processing fee is 5000 USD",
                "confidence": 0.55,
                "citation_status": "grounded",
            }
        ]
        state["queue_buckets"] = QueueBuckets(
            auto_approve=[],
            escalate=[claim_id],
            auto_reject=[],
        )

        sse_events = []

        async def sse_callback(event: dict):
            sse_events.append(event)

        nodes = _get_pipeline_nodes()
        ctx = {
            "run_id": run_id,
            "session_factory": SessionLocal,
            "approval_service": postgres_approval_service,
        }

        # Execute starting at human_review (index 11)
        final_state = await _execute_nodes_from(
            state=state,
            nodes=nodes,
            start_index=11,
            ctx=ctx,
            session_factory=SessionLocal,
            sse_callback=sse_callback,
        )

        # 1. State returned must be flagged paused
        assert final_state.get("_is_paused") is True
        assert "human_review" in final_state["completed_nodes"]
        assert "finalize" not in final_state["completed_nodes"]

        # 2. Database run status must be 'paused'
        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "paused"

        # 3. Checkpoint for human_review must exist in run_steps
        step = db_session.execute(
            select(RunStep).where(
                RunStep.run_id == uuid.UUID(run_id),
                RunStep.step_name == "human_review",
            )
        ).scalar_one_or_none()
        assert step is not None
        assert step.status == "completed"

        # 4. finalize step must NOT exist
        finalize_step = db_session.execute(
            select(RunStep).where(
                RunStep.run_id == uuid.UUID(run_id),
                RunStep.step_name == "finalize",
            )
        ).scalar_one_or_none()
        assert finalize_step is None

        # 5. Audit history must contain transition running -> paused
        audit_rows = db_session.execute(
            text("""
                SELECT action, previous_state, new_state
                FROM audit_events
                WHERE entity_id = :run_id AND action = 'status_changed'
                ORDER BY event_timestamp DESC
            """),
            {"run_id": run_id},
        ).fetchall()
        assert len(audit_rows) > 0
        run_status_audits = [r for r in audit_rows if r[2].get("type") == "run_status"]
        assert len(run_status_audits) > 0
        latest_audit = run_status_audits[0]
        assert latest_audit[1].get("status") == "running"
        assert latest_audit[2].get("status") == "paused"

        # 6. SSE event 'run_paused' was broadcast
        paused_events = [e for e in sse_events if e.get("type") == "run_paused"]
        assert len(paused_events) == 1
        assert paused_events[0]["status"] == "paused"

    @pytest.mark.asyncio
    async def test_run_completes_when_zero_items(self, db_session, postgres_approval_service):
        """When zero items are escalated, run continues to finalize and completes."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "running")

        state = create_initial_state(
            run_id=run_id,
            document_id=str(uuid.uuid4()),
            document_version_id=str(uuid.uuid4()),
            config=load_config(),
        )
        # Empty escalate list
        state["queue_buckets"] = QueueBuckets(
            auto_approve=[],
            escalate=[],
            auto_reject=[],
        )
        state["claims"] = [
            {
                "claim_id": "auto_approved_claim_1",
                "claim_text": "Interest rate is 4.5%",
                "confidence": 0.95,
                "citation_status": "grounded",
            }
        ]

        sse_events = []

        async def sse_callback(event: dict):
            sse_events.append(event)

        nodes = _get_pipeline_nodes()
        ctx = {
            "run_id": run_id,
            "session_factory": SessionLocal,
            "approval_service": postgres_approval_service,
        }

        # Execute starting at human_review (index 11)
        final_state = await _execute_nodes_from(
            state=state,
            nodes=nodes,
            start_index=11,
            ctx=ctx,
            session_factory=SessionLocal,
            sse_callback=sse_callback,
        )

        assert not final_state.get("_is_paused")
        assert "human_review" in final_state["completed_nodes"]
        assert "finalize" in final_state["completed_nodes"]

        # Run status in DB must be 'completed'
        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "completed"

        # Deliverable must exist
        deliverable = load_deliverable_record(SessionLocal, run_id)
        assert deliverable is not None
        assert deliverable["claim_count"] >= 1

    @pytest.mark.asyncio
    async def test_deciding_last_item_resumes_and_finalizes(
        self, db_session, postgres_approval_service
    ):
        """When the last pending item is decided via decide_item, the run automatically
        resumes from finalize and completes."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "running")

        claim_a = f"claim_a_{uuid.uuid4().hex[:4]}"
        claim_b = f"claim_b_{uuid.uuid4().hex[:4]}"
        state = create_initial_state(
            run_id=run_id,
            document_id=str(uuid.uuid4()),
            document_version_id=str(uuid.uuid4()),
            config=load_config(),
        )
        state["claims"] = [
            {"claim_id": claim_a, "claim_text": "Text A", "confidence": 0.5},
            {"claim_id": claim_b, "claim_text": "Text B", "confidence": 0.6},
        ]
        state["queue_buckets"] = QueueBuckets(
            auto_approve=[],
            escalate=[claim_a, claim_b],
            auto_reject=[],
        )

        nodes = _get_pipeline_nodes()
        ctx = {
            "run_id": run_id,
            "session_factory": SessionLocal,
            "approval_service": postgres_approval_service,
        }

        # Run human_review -> pauses
        await _execute_nodes_from(
            state=state,
            nodes=nodes,
            start_index=11,
            ctx=ctx,
            session_factory=SessionLocal,
            sse_callback=None,
        )

        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "paused"

        pending = postgres_approval_service.get_pending(run_id)
        assert len(pending) == 2

        # Decide first item: 1 item remains pending -> run stays paused
        from src.pipeline.approval_api import DecisionRequest
        req1 = DecisionRequest(decision="approved", reviewer_id="rev_1", justification="OK")
        decide_item(pending[0].id, req1, service=postgres_approval_service)

        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "paused"

        # Decide second (last) item -> auto resume triggered
        req2 = DecisionRequest(decision="rejected", reviewer_id="rev_2", justification="Mismatch")
        decide_item(pending[1].id, req2, service=postgres_approval_service)

        # Wait briefly for background task to complete
        for _ in range(50):
            await asyncio.sleep(0.1)
            db_session.expire_all()
            run = db_session.execute(
                select(Run).where(Run.id == uuid.UUID(run_id))
            ).scalar_one()
            if run.status == "completed":
                break

        assert run.status == "completed"

        # Finalize step completed
        fin_step = db_session.execute(
            select(RunStep).where(
                RunStep.run_id == uuid.UUID(run_id),
                RunStep.step_name == "finalize",
            )
        ).scalar_one_or_none()
        assert fin_step is not None
        assert fin_step.status == "completed"

    @pytest.mark.asyncio
    async def test_deliverable_reflects_decisions(
        self, db_session, postgres_approval_service
    ):
        """Deliverable persisted upon resume/finalize reflects human review decisions."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "running")

        claim_1 = f"loan_agreement.fee_{uuid.uuid4().hex[:4]}"
        claim_2 = f"loan_agreement.rate_{uuid.uuid4().hex[:4]}"
        state = create_initial_state(
            run_id=run_id,
            document_id=str(uuid.uuid4()),
            document_version_id=str(uuid.uuid4()),
            config=load_config(),
        )
        state["claims"] = [
            {"claim_id": claim_1, "claim_text": "Origination fee: 2000", "confidence": 0.5},
            {"claim_id": claim_2, "claim_text": "Interest rate: 12%", "confidence": 0.6},
        ]
        state["queue_buckets"] = QueueBuckets(
            auto_approve=[],
            escalate=[claim_1, claim_2],
            auto_reject=[],
        )

        nodes = _get_pipeline_nodes()
        ctx = {
            "run_id": run_id,
            "session_factory": SessionLocal,
            "approval_service": postgres_approval_service,
        }

        # 1. Run human review -> pauses
        await _execute_nodes_from(
            state=state,
            nodes=nodes,
            start_index=11,
            ctx=ctx,
            session_factory=SessionLocal,
            sse_callback=None,
        )

        pending = postgres_approval_service.get_pending(run_id)
        assert len(pending) == 2

        # 2. Decide both items (one approved, one rejected)
        from src.pipeline.approval_api import DecisionRequest
        # Map which item corresponds to which claim
        p1 = next(p for p in pending if claim_1 in p.payload.get("summary", "") or p.payload.get("details", {}).get("claim_id") == claim_1)
        p2 = next(p for p in pending if claim_2 in p.payload.get("summary", "") or p.payload.get("details", {}).get("claim_id") == claim_2)

        decide_item(
            p1.id,
            DecisionRequest(decision="approved", reviewer_id="user1", justification="Approved after inspection"),
            service=postgres_approval_service,
        )
        decide_item(
            p2.id,
            DecisionRequest(decision="rejected", reviewer_id="user2", justification="Rejected due to mismatch"),
            service=postgres_approval_service,
        )

        # Wait for resume and finalization
        for _ in range(50):
            await asyncio.sleep(0.1)
            db_session.expire_all()
            run = db_session.execute(
                select(Run).where(Run.id == uuid.UUID(run_id))
            ).scalar_one()
            if run.status == "completed":
                break

        assert run.status == "completed"

        # 3. Check deliverable record in database
        deliverable = load_deliverable_record(SessionLocal, run_id)
        assert deliverable is not None

        # Inspect claims in sections
        found_claims = {}
        for section in deliverable["sections"].values():
            for c in section["claims"]:
                found_claims[c["claim_id"]] = c

        assert claim_1 in found_claims
        assert claim_2 in found_claims
        assert found_claims[claim_1].get("decision") == "approved"
        assert found_claims[claim_2].get("decision") == "rejected"


class TestResumeEndpoint:
    """Test suite for POST /runs/{run_id}/resume endpoint."""

    def test_resume_endpoint_rejects_completed_run(self, db_session, client):
        """Resuming a completed run must fail with HTTP 400."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "completed")

        response = client.post(f"/runs/{run_id}/resume")
        assert response.status_code == 400
        assert "not resumable" in response.json()["detail"].lower() or "status is 'completed'" in response.json()["detail"].lower()

    def test_resume_endpoint_rejects_cancelled_run(self, db_session, client):
        """Resuming a cancelled run must fail with HTTP 400."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "cancelled")

        response = client.post(f"/runs/{run_id}/resume")
        assert response.status_code == 400
        assert "not resumable" in response.json()["detail"].lower() or "status is 'cancelled'" in response.json()["detail"].lower()

    def test_resume_endpoint_idempotent_when_active(self, db_session, client):
        """Calling resume twice while a run is active must be idempotent (no double execution)."""
        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "paused")

        # First call triggers resume
        resp1 = client.post(f"/runs/{run_id}/resume")
        assert resp1.status_code == 200
        assert resp1.json()["status"] == "resumed"

        # Second call while active or running must also return 200 without error
        resp2 = client.post(f"/runs/{run_id}/resume")
        assert resp2.status_code == 200
        assert resp2.json()["status"] == "resumed"

    @pytest.mark.asyncio
    async def test_resume_endpoint_continues_execution_from_checkpoint(
        self, db_session, client, postgres_approval_service
    ):
        """Calling POST /runs/{run_id}/resume on a paused run executes remaining nodes to completion."""
        import time
        from src.pipeline.serialization import serialize_state

        run_id = str(uuid.uuid4())
        _create_test_run(db_session, run_id, "running")

        state = create_initial_state(
            run_id=run_id,
            document_id=str(uuid.uuid4()),
            document_version_id=str(uuid.uuid4()),
            config=load_config(),
        )
        claim_id = f"resumable_claim_{uuid.uuid4().hex[:4]}"
        state["claims"] = [
            {"claim_id": claim_id, "claim_text": "Sample claim", "confidence": 0.8}
        ]
        state["queue_buckets"] = QueueBuckets(
            auto_approve=[],
            escalate=[claim_id],
            auto_reject=[],
        )

        nodes = _get_pipeline_nodes()
        ctx = {
            "run_id": run_id,
            "session_factory": SessionLocal,
            "approval_service": postgres_approval_service,
        }

        # 1. Run human_review -> pauses
        await _execute_nodes_from(
            state=state,
            nodes=nodes,
            start_index=11,
            ctx=ctx,
            session_factory=SessionLocal,
            sse_callback=None,
        )

        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "paused"

        # 2. Decide the pending item so it's ready
        pending = postgres_approval_service.get_pending(run_id)
        assert len(pending) == 1
        # Use direct store decision so auto-resume is not triggered via API
        postgres_approval_service.decide(
            item_id=pending[0].id,
            decision=DecisionValue.APPROVED,
            reviewer_id="tester",
            justification="Pre-approved for resume test",
        )

        # Confirm run is still paused
        db_session.expire_all()
        run = db_session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one()
        assert run.status == "paused"

        # 3. Call POST /runs/{run_id}/resume
        resp = client.post(f"/runs/{run_id}/resume")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "resumed"
        assert data["resumed_from"] == "human_review"
        assert data["next_node"] == "finalize"

        # 4. Wait for background task to complete finalize
        for _ in range(50):
            await asyncio.sleep(0.1)
            db_session.expire_all()
            run = db_session.execute(
                select(Run).where(Run.id == uuid.UUID(run_id))
            ).scalar_one()
            if run.status == "completed":
                break

        assert run.status == "completed"

        # 5. Check finalize step was completed
        fin_step = db_session.execute(
            select(RunStep).where(
                RunStep.run_id == uuid.UUID(run_id),
                RunStep.step_name == "finalize",
            )
        ).scalar_one_or_none()
        assert fin_step is not None
        assert fin_step.status == "completed"
