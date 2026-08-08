# src/

## Models (`src/models/`)

SQLAlchemy declarative models for the PostgreSQL schema (10 tables).

| Module | Tables |
|--------|--------|
| `documents.py` | documents, document_versions |
| `runs.py` | runs, run_steps |
| `claims.py` | claims, source_locations |
| `approval.py` | approval_queue, decisions |
| `audit.py` | audit_events |
| `schema_migrations.py` | schema_migrations |

## Pipeline (`src/pipeline/`)

LangGraph pipeline implementation — 3 stages, 10 nodes, conditional routing.

### Core Modules

| Module | Purpose |
|--------|---------|
| `state.py` | `PipelineState` TypedDict, supporting types, `create_initial_state()` |
| `config.py` | `load_config()` with defaults and constraint validation |
| `routing.py` | `make_routing_fn()` factory — per-node conditional edge logic |
| `serialization.py` | `serialize_state()` / `deserialize_state()` (bytes ↔ base64) |
| `checkpoint.py` | `write_checkpoint()` / `create_step_row()` — per-node snapshots |
| `resume.py` | `resume_run()` — restore from last checkpoint, determine next node |
| `graph.py` | `build_graph()` — StateGraph assembly with all nodes and edges |
| `api.py` | FastAPI router: `POST /runs`, `POST /runs/{id}/resume` |
| `polling.py` | `PollingService` — checks decisions, triggers resume, sends reminders |

### Nodes (`src/pipeline/nodes/`)

| Node | Stage | Responsibility |
|------|-------|---------------|
| `ingest` | Understand | Load document bytes, validate MIME |
| `extract_text` | Understand | Convert to plain text (skip if already text) |
| `chunk` | Understand | Split text into overlapping segments |
| `embed` | Understand | Generate + store vector embeddings |
| `extract_claims` | Examine | Identify factual assertions via LLM |
| `match_rules` | Examine | Compare claims against compliance rules |
| `score_confidence` | Examine | Refine scores, flag for human review |
| `route_to_queue` | Stay-Alive | Partition into approve/escalate/reject |
| `human_review` | Stay-Alive | Interrupt for human decisions |
| `finalize` | Stay-Alive | Write results, close run, emit audit events |
