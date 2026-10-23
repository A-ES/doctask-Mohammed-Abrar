"""MCP (Model Context Protocol) server exposing pipeline operations as tools.

This server mirrors the same operations as the REST endpoints, both calling
the shared service functions in src.pipeline.services — no separate logic
paths. A program can drive the entire pipeline flow end-to-end through
MCP tools alone.

Tools exposed:
- start_run: Create/upload a new pipeline run (a "pile")
- get_run_status: Query run status and next node
- list_pending_approvals: List items awaiting approval
- decide_approval: Approve or reject an approval queue item
- get_deliverable: Get the current assembled deliverable
- get_change_history: Get the audit trail for a run
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from mcp.server.mcpserver import MCPServer

from src.pipeline.cancel import request_cancel
from src.pipeline.services import (
    ServiceRegistry,
    create_run,
    decide_approval_item,
    get_change_history,
    get_run_cost,
    get_run_deliverable,
    get_run_status,
    list_pending_approvals,
    registry,
)


def setup_server(
    session_factory: Any = None,
    engine: Any = None,
    database_url: str | None = None,
    check_db: bool = True,
) -> ServiceRegistry:
    """Initialize database-backed stores and configure the service registry for MCP tools."""
    from src.pipeline.service_init import init_services

    return init_services(
        session_factory=session_factory,
        engine=engine,
        database_url=database_url,
        check_db=check_db,
    )


# ---------------------------------------------------------------------------
# MCP Server definition
# ---------------------------------------------------------------------------

mcp = MCPServer(name="docpipeline", description="Document intelligence pipeline MCP server")


@mcp.tool(
    name="start_run",
    description=(
        "Start a new pipeline run. Provide pile_id (preferred) to run against "
        "a document pile, or document_id and document_version_id for a single document. "
        "Creates the run, freezes config, and returns the run_id."
    ),
)
def start_run_tool(
    document_id: str | None = None,
    document_version_id: str | None = None,
    config_overrides: dict[str, Any] | None = None,
    pile_id: str | None = None,
) -> str:
    """Start a new pipeline run."""
    import uuid

    if isinstance(config_overrides, str) and pile_id is None:
        pile_id = config_overrides
        config_overrides = None

    if registry.run_store is None:
        setup_server(check_db=True)

    pile_document_ids: list[str] | None = None

    # If pile_id is given but document IDs are not, resolve primary document from pile
    if pile_id and (not document_id or not document_version_id):
        session_factory = getattr(registry.run_store, "_session_factory", None)
        if session_factory is not None:
            from sqlalchemy import select
            from src.models.documents import Document, DocumentVersion
            from src.models.piles import Pile, PileDocument

            with session_factory() as session:
                try:
                    pile_uuid = uuid.UUID(str(pile_id))
                except ValueError:
                    return json.dumps({
                        "run_id": "",
                        "status": "error",
                        "error": f"Invalid pile_id UUID: {pile_id}",
                    })

                pile = session.execute(
                    select(Pile).where(Pile.id == pile_uuid)
                ).scalar_one_or_none()
                if pile is None:
                    return json.dumps({
                        "run_id": "",
                        "status": "error",
                        "error": f"Pile not found: {pile_id}",
                    })

                pile_docs = session.execute(
                    select(PileDocument)
                    .where(PileDocument.pile_id == pile_uuid)
                    .order_by(PileDocument.added_at)
                ).scalars().all()
                if not pile_docs:
                    return json.dumps({
                        "run_id": "",
                        "status": "error",
                        "error": f"Pile {pile_id} has no documents",
                    })

                pile_document_ids = [str(pd.document_id) for pd in pile_docs]
                first_doc_id = pile_docs[0].document_id

                version = session.execute(
                    select(DocumentVersion)
                    .where(DocumentVersion.document_id == first_doc_id)
                    .order_by(DocumentVersion.version_number.desc())
                ).scalars().first()

                if version is None:
                    return json.dumps({
                        "run_id": "",
                        "status": "error",
                        "error": f"No usable version found for document {first_doc_id}",
                    })

                document_id = str(first_doc_id)
                document_version_id = str(version.id)

    if not document_id or not document_version_id:
        return json.dumps({
            "run_id": "",
            "status": "error",
            "error": "Provide pile_id or both document_id and document_version_id",
        })

    result = create_run(
        document_id=document_id,
        document_version_id=document_version_id,
        config_overrides=config_overrides,
        pile_id=pile_id,
        pile_document_ids=pile_document_ids,
    )
    return json.dumps(asdict(result))


@mcp.tool(
    name="get_run_status",
    description=(
        "Get the current status of a pipeline run. "
        "Returns status, the step it resumed from, and the next node to execute."
    ),
)
def get_run_status_tool(run_id: str) -> str:
    """Get run status."""
    result = get_run_status(run_id=run_id)
    return json.dumps(asdict(result))


@mcp.tool(
    name="list_pending_approvals",
    description=(
        "List all approval queue items for a run, including pending, "
        "approved, and rejected items with counts."
    ),
)
def list_pending_approvals_tool(run_id: str) -> str:
    """List pending approvals."""
    result = list_pending_approvals(run_id=run_id)
    return json.dumps(asdict(result))


@mcp.tool(
    name="decide_approval",
    description=(
        "Approve or reject a single approval queue item. "
        "Each decision is atomic and independent — deciding one item "
        "never affects another."
    ),
)
def decide_approval_tool(
    item_id: str,
    decision: str,
    reviewer_id: str,
    justification: str,
) -> str:
    """Decide on an approval item."""
    result = decide_approval_item(
        item_id=item_id,
        decision=decision,
        reviewer_id=reviewer_id,
        justification=justification,
    )
    return json.dumps(asdict(result))


@mcp.tool(
    name="get_deliverable",
    description=(
        "Get the persisted deliverable for a pipeline run — the assembled "
        "output written by the finalize node. Returns the deliverable hash, "
        "sections with content hashes, and claims with citations. "
        "Returns an error if the run has not been finalized."
    ),
)
def get_deliverable_tool(run_id: str) -> str:
    """Get the persisted deliverable for a run."""
    result = get_run_deliverable(run_id=run_id)
    if result is None:
        return json.dumps({
            "error": "not_found",
            "run_id": run_id,
            "message": (
                "No deliverable found for this run. Deliverables are "
                "persisted when a run reaches the finalize node."
            ),
        })
    return json.dumps(asdict(result))


@mcp.tool(
    name="get_change_history",
    description=(
        "Get the full change history (audit trail) for a pipeline run. "
        "Returns chronologically ordered events showing what changed, when, "
        "and because of which source document."
    ),
)
def get_change_history_tool(run_id: str) -> str:
    """Get change history for a run."""
    result = get_change_history(run_id=run_id)
    return json.dumps(asdict(result))


@mcp.tool(
    name="get_run_cost",
    description=(
        "Get per-stage cost and time breakdown for a pipeline run. "
        "Returns total duration, token counts, and estimated USD cost, "
        "plus a per-stage breakdown for each pipeline node."
    ),
)
def get_run_cost_tool(run_id: str) -> str:
    """Get cost and time breakdown for a run."""
    result = get_run_cost(run_id=run_id)
    return json.dumps(asdict(result))


@mcp.tool(
    name="cancel_run",
    description=(
        "Cancel a running pipeline. Sets a cooperative cancellation flag "
        "so the executor stops after the current node finishes. All "
        "completed checkpoints and audit events are preserved. "
        "The run can be resumed later via the resume tool or endpoint."
    ),
)
def cancel_run_tool(run_id: str) -> str:
    """Cancel a pipeline run cooperatively."""
    request_cancel(run_id)
    return json.dumps({
        "run_id": run_id,
        "status": "cancelling",
        "message": (
            "Cancellation requested. The run will stop after the current "
            "node completes. All checkpoints are preserved."
        ),
    })


# ---------------------------------------------------------------------------
# Entry point for stdio transport
# ---------------------------------------------------------------------------


async def main() -> None:
    """Run the MCP server over stdin/stdout."""
    setup_server(check_db=True)
    await mcp.run_stdio_async()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
