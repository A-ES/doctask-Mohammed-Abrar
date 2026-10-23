"""Service initialization and dependency injection setup for application and MCP server.

Provides unified startup initialization for SQLAlchemy-backed stores, approval
services, decision listeners, claim persisters, and service registry configuration,
ensuring consistent behavior across REST (src.main) and MCP (src.mcp_server).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from src.database import DATABASE_URL as DEFAULT_DATABASE_URL
from src.database import SessionLocal as DefaultSessionLocal
from src.database import engine as default_engine
from src.pipeline.api import set_history_store, set_resume_store, set_run_store
from src.pipeline.approval import ApprovalService
from src.pipeline.approval_api import set_approval_service, set_queue_context_provider
from src.pipeline.approval_postgres import PostgresApprovalStore
from src.pipeline.history_sql import SQLHistoryStore
from src.pipeline.history_sql import emit_decision_event as _emit_decision
from src.pipeline.incremental_api import set_incremental_approval_service
from src.pipeline.nodes.extract_claims import set_claim_persister
from src.pipeline.queue_enrichment import make_db_context_provider
from src.pipeline.services import ServiceRegistry, registry
from src.pipeline.source_linker import make_sql_claim_persister
from src.pipeline.stores import SQLCostStore, SQLResumeStore, SQLRunStore

logger = logging.getLogger("docpipeline.services")


def check_database_connection(
    engine: Any = None, database_url: str | None = None
) -> None:
    """Verify database connectivity by executing SELECT 1.

    Fails fast with a clear RuntimeError if the database is unreachable.
    """
    target_engine = engine if engine is not None else default_engine
    target_url = database_url or getattr(target_engine, "url", DEFAULT_DATABASE_URL)
    try:
        with target_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise RuntimeError(
            f"Database is unreachable at {target_url}: {exc}. "
            "Please ensure PostgreSQL is running and DATABASE_URL is reachable."
        ) from exc


def init_services(
    session_factory: Any = None,
    engine: Any = None,
    database_url: str | None = None,
    check_db: bool = True,
) -> ServiceRegistry:
    """Initialize all stores and services and wire them into the ServiceRegistry.

    Args:
        session_factory: SQLAlchemy sessionmaker (defaults to src.database.SessionLocal).
        engine: SQLAlchemy engine (defaults to src.database.engine).
        database_url: Optional override for DATABASE_URL.
        check_db: If True, ping database first and fail fast if unreachable.

    Returns:
        The configured singleton ServiceRegistry instance.
    """
    if database_url is not None:
        target_engine = create_engine(database_url, pool_pre_ping=True)
        target_session_factory = sessionmaker(
            bind=target_engine, autocommit=False, autoflush=False
        )
    else:
        target_engine = engine if engine is not None else default_engine
        target_session_factory = (
            session_factory if session_factory is not None else DefaultSessionLocal
        )

    if check_db:
        check_database_connection(target_engine, database_url=database_url)

    # 1. Approval store and service (durable across restarts via approval_queue/decisions)
    approval_store = PostgresApprovalStore(target_session_factory)
    approval_service = ApprovalService(approval_store)
    set_approval_service(approval_service)

    # 2. Audit decision listener for /runs/{id}/history
    def _decision_listener(item_id, run_id, decision, reviewer_id, justification):
        _emit_decision(
            target_session_factory,
            item_id=item_id,
            run_id=run_id,
            decision=decision,
            reviewer_id=reviewer_id,
            justification=justification,
        )

    approval_service.set_decision_listener(_decision_listener)

    # 3. Claims persister
    set_claim_persister(make_sql_claim_persister(target_session_factory))

    # 4. SQL-backed stores
    history_store = SQLHistoryStore(target_session_factory)
    resume_store = SQLResumeStore(target_session_factory)
    run_store = SQLRunStore(target_session_factory)
    cost_store = SQLCostStore(target_session_factory)

    # Wire module-level globals in api.py
    set_history_store(history_store)
    set_resume_store(resume_store)
    set_run_store(run_store)

    # Wire shared ServiceRegistry
    registry.configure(
        run_store=run_store,
        resume_store=resume_store,
        history_store=history_store,
        approval_service=approval_service,
        cost_store=cost_store,
    )

    # 5. Queue enrichment context provider and incremental service
    set_queue_context_provider(make_db_context_provider(target_session_factory))
    set_incremental_approval_service(approval_service)

    logger.info("Service registry and pipeline stores successfully configured.")
    return registry


def cleanup_services() -> None:
    """Tear down services and reset registry to clean state."""
    set_approval_service(None)
    set_incremental_approval_service(None)
    set_claim_persister(None)
    set_history_store(None)
    set_resume_store(None)
    set_run_store(None)
    set_queue_context_provider(None)

    registry.run_store = None
    registry.resume_store = None
    registry.history_store = None
    registry.approval_service = None
    registry.cost_store = None
    registry.deliverable = None

    logger.info("Service registry and pipeline stores cleaned up.")
