"""FastAPI application entry point — wires all routers and services.

Mounts:
- /documents — file upload and listing
- /runs — pipeline run management (create, state, history, cost)
- /approval — approval queue management
- /health — health check
- /runs/{run_id}/stream — SSE endpoint for live pipeline updates
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select

# Load environment variables from .env
load_dotenv()

from src.database import SessionLocal, engine
from src.models.documents import Document, DocumentVersion
from src.models.runs import Run, RunStep
from src.pipeline.approval import ApprovalService, InMemoryApprovalStore
from src.pipeline.approval_api import router as approval_router, set_approval_service
from src.pipeline.api import router as runs_router
from src.pipeline.upload_api import router as upload_router

logger = logging.getLogger(__name__)

# ─── Global state for SSE ─────────────────────────────────────────────────────

# Map of run_id → list of asyncio.Queue for SSE subscribers
_sse_subscribers: dict[str, list[asyncio.Queue]] = {}


def get_sse_queue(run_id: str) -> asyncio.Queue:
    """Create and register an SSE subscriber queue for a run."""
    if run_id not in _sse_subscribers:
        _sse_subscribers[run_id] = []
    queue: asyncio.Queue = asyncio.Queue()
    _sse_subscribers[run_id].append(queue)
    return queue


def remove_sse_queue(run_id: str, queue: asyncio.Queue) -> None:
    """Remove a subscriber queue when the client disconnects."""
    if run_id in _sse_subscribers:
        try:
            _sse_subscribers[run_id].remove(queue)
        except ValueError:
            pass
        if not _sse_subscribers[run_id]:
            del _sse_subscribers[run_id]


async def broadcast_sse(run_id: str, data: dict) -> None:
    """Broadcast an event to all SSE subscribers for a run."""
    if run_id in _sse_subscribers:
        for queue in _sse_subscribers[run_id]:
            try:
                await queue.put(data)
            except Exception:
                pass


# ─── Application lifecycle ────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Initialize approval service with in-memory store
    store = InMemoryApprovalStore()
    service = ApprovalService(store)
    set_approval_service(service)
    logger.info("Application started. Approval service configured.")
    yield
    set_approval_service(None)
    logger.info("Application shutdown.")


# ─── App creation ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Agentic Document Intelligence",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(upload_router)
app.include_router(approval_router)
app.include_router(runs_router)


# ─── Health ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ─── Run management ──────────────────────────────────────────────────────────


class StartPipelineRequest(BaseModel):
    """Request to start a pipeline run on an uploaded document."""
    document_id: str = Field(..., min_length=1)
    document_version_id: str = Field(..., min_length=1)
    config_overrides: Optional[dict] = None


class StartPipelineResponse(BaseModel):
    """Response after starting a pipeline run."""
    run_id: str
    status: str


class RunListItem(BaseModel):
    """Summary of a pipeline run."""
    id: str
    status: str
    started_at: str
    document_id: Optional[str] = None
    filename: Optional[str] = None


@app.post("/runs/start", response_model=StartPipelineResponse)
async def start_pipeline(
    request: StartPipelineRequest,
    background_tasks: BackgroundTasks,
) -> StartPipelineResponse:
    """Start a new pipeline run on an uploaded document.

    Creates the run record, then kicks off async pipeline execution
    using the demo executor with real DeepSeek LLM calls.
    """
    # Verify document exists
    session = SessionLocal()
    try:
        doc = session.execute(
            select(Document).where(Document.id == uuid.UUID(request.document_id))
        ).scalar_one_or_none()
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")

        version = session.execute(
            select(DocumentVersion).where(
                DocumentVersion.id == uuid.UUID(request.document_version_id)
            )
        ).scalar_one_or_none()
        if version is None:
            raise HTTPException(status_code=404, detail="Document version not found")

        storage_path = version.storage_ref
        mime_type = doc.mime_type
        filename = doc.filename

        # Create run record
        run_id = str(uuid.uuid4())
        run = Run(
            id=uuid.UUID(run_id),
            status="pending",
            config_snapshot={
                "document_id": request.document_id,
                "document_version_id": request.document_version_id,
                **(request.config_overrides or {}),
            },
            initiator="api",
            version=1,
        )
        session.add(run)
        session.commit()
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create run: {e}")
    finally:
        session.close()

    # Start pipeline execution in background
    background_tasks.add_task(
        _execute_pipeline_background,
        run_id=run_id,
        document_id=request.document_id,
        document_version_id=request.document_version_id,
        storage_path=storage_path,
        mime_type=mime_type,
        filename=filename,
        config_overrides=request.config_overrides,
    )

    return StartPipelineResponse(run_id=run_id, status="started")


async def _execute_pipeline_background(
    run_id: str,
    document_id: str,
    document_version_id: str,
    storage_path: str,
    mime_type: str,
    filename: str,
    config_overrides: Optional[dict] = None,
) -> None:
    """Background task that runs the full pipeline."""
    from src.pipeline.demo_executor import run_pipeline

    async def sse_callback(data: dict) -> None:
        await broadcast_sse(run_id, data)

    try:
        await run_pipeline(
            run_id=run_id,
            document_id=document_id,
            document_version_id=document_version_id,
            storage_path=storage_path,
            mime_type=mime_type,
            filename=filename,
            session_factory=SessionLocal,
            config_overrides=config_overrides,
            sse_callback=sse_callback,
        )
    except Exception as e:
        logger.exception("Pipeline execution failed for run %s: %s", run_id, e)
        # Update run status to failed
        session = SessionLocal()
        try:
            run = session.execute(
                select(Run).where(Run.id == uuid.UUID(run_id))
            ).scalar_one_or_none()
            if run:
                run.status = "failed"
                session.commit()
        finally:
            session.close()
        # Notify SSE subscribers
        await broadcast_sse(run_id, {
            "type": "run_complete",
            "run_id": run_id,
            "status": "failed",
            "error": str(e),
        })


@app.get("/runs")
async def list_runs() -> list[RunListItem]:
    """List all pipeline runs."""
    session = SessionLocal()
    try:
        runs = session.execute(
            select(Run).order_by(Run.started_at.desc()).limit(50)
        ).scalars().all()

        results = []
        for run in runs:
            doc_id = run.config_snapshot.get("document_id") if run.config_snapshot else None
            filename = None
            if doc_id:
                doc = session.execute(
                    select(Document).where(Document.id == uuid.UUID(doc_id))
                ).scalar_one_or_none()
                if doc:
                    filename = doc.filename

            results.append(RunListItem(
                id=str(run.id),
                status=run.status,
                started_at=run.started_at.isoformat(),
                document_id=doc_id,
                filename=filename,
            ))
        return results
    finally:
        session.close()


@app.get("/runs/{run_id}/state")
async def get_run_state(run_id: str) -> dict:
    """Return pipeline run state for the frontend canvas.

    Reads from the latest checkpoint in run_steps to give real-time progress.
    """
    session = SessionLocal()
    try:
        run = session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")

        # Get latest completed step
        steps = session.execute(
            select(RunStep)
            .where(RunStep.run_id == uuid.UUID(run_id))
            .order_by(RunStep.step_order.desc())
        ).scalars().all()

        if not steps:
            return {
                "run_id": run_id,
                "current_node": "",
                "node_status": "pending",
                "completed_nodes": [],
                "skipped_nodes": [],
                "retries": {},
                "error_type": None,
                "error_detail": None,
                "run_status": run.status,
            }

        # Use the latest step's output_state
        latest = steps[0]
        output_state = latest.output_state or {}

        return {
            "run_id": run_id,
            "current_node": output_state.get("current_node", latest.step_name),
            "node_status": output_state.get("node_status", latest.status),
            "completed_nodes": output_state.get("completed_nodes", []),
            "skipped_nodes": output_state.get("skipped_nodes", []),
            "retries": output_state.get("retries", {}),
            "error_type": output_state.get("error_type"),
            "error_detail": output_state.get("error_detail"),
            "run_status": run.status,
        }
    finally:
        session.close()


@app.get("/runs/{run_id}/node/{node_id}/details")
async def get_node_details(run_id: str, node_id: str) -> dict:
    """Get detailed output from a specific pipeline node.

    Returns the node's execution details including duration, token usage,
    and relevant output data (claims, verdicts, findings, etc.).
    """
    session = SessionLocal()
    try:
        step = session.execute(
            select(RunStep).where(
                RunStep.run_id == uuid.UUID(run_id),
                RunStep.step_name == node_id,
            )
        ).scalar_one_or_none()

        if step is None:
            raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found for run")

        output = step.output_state or {}

        # Extract relevant data based on node type
        details: dict[str, Any] = {
            "node_id": node_id,
            "status": step.status,
            "duration_ms": step.duration_ms,
            "input_tokens": step.input_tokens,
            "output_tokens": step.output_tokens,
            "cost_usd": float(step.cost_usd) if step.cost_usd else None,
            "started_at": step.started_at.isoformat() if step.started_at else None,
            "ended_at": step.ended_at.isoformat() if step.ended_at else None,
        }

        # Add node-specific output data
        if node_id == "extract_text":
            text = output.get("extracted_text", "")
            details["extracted_text_preview"] = text[:2000] if text else None
            details["text_length"] = len(text) if text else 0

        elif node_id == "classify_document":
            details["classification_label"] = output.get("classification_label")
            details["classification_confidence"] = output.get("classification_confidence")
            details["classification_scores"] = output.get("classification_scores")

        elif node_id == "chunk":
            chunks = output.get("chunks", [])
            details["chunk_count"] = len(chunks)
            details["chunks_preview"] = [
                {"index": c.get("index"), "length": len(c.get("text", "")), "text_preview": c.get("text", "")[:100]}
                for c in chunks[:5]
            ]

        elif node_id == "extract_claims":
            claims = output.get("claims", [])
            details["claim_count"] = len(claims)
            details["claims"] = claims

        elif node_id in ("match_rules", "match_rules_against_sources"):
            details["verdicts"] = output.get("verdicts", [])
            details["findings"] = output.get("claim_findings", []) if node_id == "match_rules" else output.get("source_findings", [])

        elif node_id == "merge_findings":
            details["findings"] = output.get("findings", [])
            details["finding_count"] = len(output.get("findings", []))

        elif node_id == "score_confidence":
            details["verdicts"] = output.get("verdicts", [])

        elif node_id == "route_to_queue":
            buckets = output.get("queue_buckets", {})
            details["queue_buckets"] = buckets
            details["auto_approve_count"] = len(buckets.get("auto_approve", []))
            details["escalate_count"] = len(buckets.get("escalate", []))
            details["auto_reject_count"] = len(buckets.get("auto_reject", []))

        elif node_id == "human_review":
            details["decisions"] = output.get("decisions", [])
            details["decision_count"] = len(output.get("decisions", []))

        elif node_id == "finalize":
            details["final_status"] = "completed"
            details["total_claims"] = len(output.get("claims", []))
            details["total_findings"] = len(output.get("findings", []))

        elif node_id == "ingest":
            details["mime_type"] = output.get("mime_type")
            details["file_size"] = len(output.get("raw_content", "")) if output.get("raw_content") else None

        return details
    finally:
        session.close()


@app.get("/runs/{run_id}/cost")
async def get_run_cost(run_id: str) -> dict:
    """Get per-stage cost and duration breakdown for a pipeline run."""
    session = SessionLocal()
    try:
        steps = session.execute(
            select(RunStep)
            .where(RunStep.run_id == uuid.UUID(run_id))
            .order_by(RunStep.step_order)
        ).scalars().all()

        stages = []
        total_duration = 0
        total_input = 0
        total_output = 0
        total_cost = 0.0

        for step in steps:
            d = step.duration_ms or 0
            i = step.input_tokens or 0
            o = step.output_tokens or 0
            c = float(step.cost_usd or 0)
            total_duration += d
            total_input += i
            total_output += o
            total_cost += c
            stages.append({
                "stage": step.step_name,
                "step_order": step.step_order,
                "status": step.status,
                "duration_ms": d,
                "input_tokens": i,
                "output_tokens": o,
                "cost_usd": c,
            })

        return {
            "run_id": run_id,
            "total_duration_ms": total_duration,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_cost_usd": total_cost,
            "stages": stages,
        }
    finally:
        session.close()


# ─── Report / Summary ─────────────────────────────────────────────────────────


@app.get("/runs/{run_id}/report")
async def get_run_report(run_id: str) -> dict:
    """Generate a comprehensive compliance report for a completed pipeline run.

    Returns a structured summary including:
    - Overall compliance verdict
    - Risk score
    - Document classification
    - All extracted claims with their verdicts
    - Findings and violations
    - Recommendations
    """
    session = SessionLocal()
    try:
        run = session.execute(
            select(Run).where(Run.id == uuid.UUID(run_id))
        ).scalar_one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")

        if run.status not in ("completed", "failed"):
            return {
                "run_id": run_id,
                "status": run.status,
                "ready": False,
                "message": "Pipeline has not completed yet.",
            }

        # Get all steps and their outputs
        steps = session.execute(
            select(RunStep)
            .where(RunStep.run_id == uuid.UUID(run_id))
            .order_by(RunStep.step_order)
        ).scalars().all()

        # Build report from step outputs
        step_outputs = {}
        total_duration = 0
        total_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        for step in steps:
            step_outputs[step.step_name] = step.output_state or {}
            total_duration += step.duration_ms or 0
            total_cost += float(step.cost_usd or 0)
            total_input_tokens += step.input_tokens or 0
            total_output_tokens += step.output_tokens or 0

        # Extract key data from step outputs
        classify_out = step_outputs.get("classify_document", {})
        claims_out = step_outputs.get("extract_claims", {})
        rules_out = step_outputs.get("match_rules", {})
        source_out = step_outputs.get("match_rules_against_sources", {})
        merge_out = step_outputs.get("merge_findings", {})
        route_out = step_outputs.get("route_to_queue", {})
        text_out = step_outputs.get("extract_text", {})

        claims = claims_out.get("claims", [])
        verdicts = rules_out.get("verdicts", [])
        findings = merge_out.get("findings", [])
        source_findings = source_out.get("source_findings", [])
        queue_buckets = route_out.get("queue_buckets", {})

        # Compute overall verdict
        non_compliant_count = sum(1 for v in verdicts if v.get("verdict") == "non_compliant")
        indeterminate_count = sum(1 for v in verdicts if v.get("verdict") == "indeterminate")
        compliant_count = sum(1 for v in verdicts if v.get("verdict") == "compliant")
        total_claims = len(claims)

        if non_compliant_count > 0:
            overall_verdict = "NON-COMPLIANT"
            risk_level = "HIGH"
        elif indeterminate_count > total_claims * 0.3:
            overall_verdict = "REQUIRES REVIEW"
            risk_level = "MEDIUM"
        elif indeterminate_count > 0:
            overall_verdict = "MOSTLY COMPLIANT"
            risk_level = "LOW"
        else:
            overall_verdict = "COMPLIANT"
            risk_level = "MINIMAL"

        # Risk score (0-100)
        if total_claims > 0:
            risk_score = int(
                (non_compliant_count * 100 + indeterminate_count * 40) / total_claims
            )
        else:
            risk_score = 0
        risk_score = min(risk_score, 100)

        # Build claim details with verdicts
        verdict_map = {v.get("claim_id"): v for v in verdicts}
        claim_details = []
        for claim in claims:
            cid = claim.get("claim_id", "")
            v = verdict_map.get(cid, {})
            claim_details.append({
                "claim_id": cid,
                "claim_text": claim.get("claim_text", ""),
                "confidence": claim.get("confidence", 0),
                "verdict": v.get("verdict", "not_evaluated"),
                "rule_id": v.get("rule_id"),
                "needs_review": v.get("needs_human_review", False),
            })

        # Get document info
        doc_id = run.config_snapshot.get("document_id") if run.config_snapshot else None
        filename = None
        if doc_id:
            doc = session.execute(
                select(Document).where(Document.id == uuid.UUID(doc_id))
            ).scalar_one_or_none()
            if doc:
                filename = doc.filename

        report = {
            "run_id": run_id,
            "ready": True,
            "status": run.status,
            "generated_at": datetime.now(timezone.utc).isoformat(),

            # Document info
            "document": {
                "filename": filename,
                "classification": classify_out.get("classification_label", "unknown"),
                "classification_confidence": classify_out.get("classification_confidence", 0),
                "text_length": len(text_out.get("extracted_text", "")),
            },

            # Overall assessment
            "assessment": {
                "overall_verdict": overall_verdict,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "summary": _generate_summary(overall_verdict, non_compliant_count, indeterminate_count, compliant_count, total_claims, findings),
            },

            # Claim breakdown
            "claims": {
                "total": total_claims,
                "compliant": compliant_count,
                "non_compliant": non_compliant_count,
                "indeterminate": indeterminate_count,
                "details": claim_details,
            },

            # Findings
            "findings": {
                "total": len(findings),
                "items": findings[:20],  # Limit to first 20
                "source_findings": source_findings[:10],
            },

            # Queue routing
            "routing": {
                "auto_approved": len(queue_buckets.get("auto_approve", [])),
                "escalated": len(queue_buckets.get("escalate", [])),
                "auto_rejected": len(queue_buckets.get("auto_reject", [])),
            },

            # Execution stats
            "execution": {
                "total_duration_ms": total_duration,
                "total_cost_usd": total_cost,
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
                "nodes_completed": len([s for s in steps if s.status == "completed"]),
                "nodes_skipped": len([s for s in steps if s.status == "skipped"]),
                "nodes_failed": len([s for s in steps if s.status == "failed"]),
            },
        }

        return report
    finally:
        session.close()


def _generate_summary(verdict: str, non_compliant: int, indeterminate: int, compliant: int, total: int, findings: list) -> str:
    """Generate a human-readable summary paragraph."""
    parts = []
    parts.append(f"Document analysis complete. {total} factual claims were extracted and evaluated against compliance rules.")

    if non_compliant > 0:
        parts.append(f"{non_compliant} claim(s) were found NON-COMPLIANT, requiring immediate attention.")
    if indeterminate > 0:
        parts.append(f"{indeterminate} claim(s) could not be definitively assessed and require manual review.")
    if compliant > 0 and non_compliant == 0:
        parts.append(f"All {compliant} evaluated claims are within regulatory bounds.")

    if findings:
        parts.append(f"{len(findings)} finding(s) were identified during source document analysis.")

    return " ".join(parts)


# ─── SSE streaming ────────────────────────────────────────────────────────────


@app.get("/runs/{run_id}/stream")
async def stream_run_events(run_id: str):
    """Server-Sent Events stream for real-time pipeline progress.

    Clients connect here and receive events as nodes start/complete.
    """
    queue = get_sse_queue(run_id)

    async def event_generator():
        try:
            # Send initial state
            session = SessionLocal()
            try:
                run = session.execute(
                    select(Run).where(Run.id == uuid.UUID(run_id))
                ).scalar_one_or_none()
                if run:
                    yield {
                        "event": "connected",
                        "data": json.dumps({
                            "run_id": run_id,
                            "status": run.status,
                        }),
                    }
            finally:
                session.close()

            # Stream events
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": data.get("type", "update"),
                        "data": json.dumps(data),
                    }
                    # Stop streaming when run completes
                    if data.get("type") == "run_complete":
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield {"event": "ping", "data": ""}
        finally:
            remove_sse_queue(run_id, queue)

    return EventSourceResponse(event_generator())
