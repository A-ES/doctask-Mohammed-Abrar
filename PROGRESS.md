# PROGRESS.md

**Project Start Date:** 2026-08-08

## 2026-08-08 — Phase 1 complete

**Built:**
- Core Postgres schema design (reviewed)
- LangGraph node/edge structure + routing conditions (reviewed)

## 2026-08-08 — Core Schema Implementation complete

**Built:**
- 7 SQL migration files (001–007), verified against live PostgreSQL 16
- 10 database tables: documents, document_versions, runs, run_steps, claims, source_locations, approval_queue, decisions, audit_events, schema_migrations
- 3 database triggers: version immutability, run status state machine, audit append-only guard, decision pending guard
- 23 indexes for query performance
- Migration runner (`migrations/run_migrations.py`) with idempotency and transaction safety
- 8 SQLAlchemy model modules with relationships and OCC version columns
- 14 property-based tests (Hypothesis) — all passing (15 test functions, 100 examples each)

**Key schema features:**
- Content-hash deduplication for document versions
- Run status state machine enforced at DB level (pending → running → completed|failed|cancelled)
- Append-only audit trail with trigger protection
- Optimistic concurrency control on runs, run_steps, approval_queue
- ON DELETE RESTRICT on all parent-child FK relationships
- IF NOT EXISTS on all DDL for migration idempotency

## 2026-08-08 — LangGraph Pipeline Implementation complete

**Built:**
- Full 3-stage pipeline: Understand (4 nodes) → Examine (3 nodes) → Stay-Alive (3 nodes)
- 10 async pipeline nodes with dependency-injected services (LLM, storage, DB)
- Routing function factory with per-node conditional edge logic (retry, skip, escalate, unhandled fallback)
- State schema (`PipelineState` TypedDict) with JSONB serialization round-trip
- Config loader with constraint validation and defaults
- Checkpoint persistence layer (write iff success, never on error/retry)
- Kill-and-resume logic with advisory lock enforcement and orphan cleanup
- LangGraph StateGraph assembly module (all nodes + conditional edges registered)
- FastAPI endpoints: `POST /runs` (create), `POST /runs/{id}/resume`
- Human review polling service (decision completeness checks + reminder audit events)
- 489 pipeline tests passing (unit tests + 16 property-based correctness tests)

**Property-based tests (Hypothesis) verify:**
- P1: Stage ordering invariant
- P2: Routing determinism (exactly one match)
- P3: Retry routing correctness
- P4: Unrecognized error type escalation
- P5: Checkpoint iff success
- P6: State JSONB round-trip
- P7: Skip routing and metadata
- P8: Claim partitioning priority
- P9: Escalate bucket determines human review routing
- P10: Resume restart correctness
- P11: Chunk coverage (no gaps)
- P12: Extraction offset ordering
- P13: Verdicts-claims length parity
- P14: Confidence flagging threshold
- P15: Post-human-review always finalizes
- P16: Node completion contract

**Still open / next:**
- LangGraph runtime integration (requires `langgraph` package install)
- Wire real PDF/DOCX extractors (pdfplumber, python-docx)
- Wire real embedding service (OpenAI, etc.)
- MCP + React UI + cost tracking

## Assumptions Log

| Date | Assumption | Reasoning |
|------|------------|-----------|
| 2026-08-08 | OCC version increment is application-enforced via WHERE clause, not auto-managed by SQLAlchemy | Gives explicit control over conflict detection and retry logic |
| 2026-08-08 | Tests use transaction rollback isolation (no cleanup between tests) | Faster tests, zero side effects between runs |
