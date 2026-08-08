# supa_doccs

Document intelligence pipeline for synthetic microfinance and consumer loan compliance analysis.

## Domain & Formats

**Domain:** Microfinance and consumer loan agreements (Financial Compliance & Credit Auditing)
**Formats:** PDF, DOCX, plain text

## Architecture

- **Pipeline:** LangGraph StateGraph with 10 nodes across 3 stages (Understand → Examine → Stay-Alive)
- **Persistence:** PostgreSQL 16 + pgvector; all run state checkpointed as JSONB
- **Resumability:** Per-node checkpoints with advisory locks; killed runs resume from last completed step
- **Routing:** Conditional edges with retry (bounded), skip, and escalate logic
- **Human gate:** Item-by-item approve/reject via interrupt node + polling service
- **Concurrency:** Per-run_id advisory locks + OCC version columns
- **Audit:** Append-only `audit_events` table with trigger protection

## Project Structure

```
├── migrations/              # Sequential SQL migrations (001–007)
├── src/
│   ├── models/              # SQLAlchemy declarative models (10 tables)
│   ├── pipeline/
│   │   ├── nodes/           # 10 async pipeline nodes
│   │   ├── state.py         # PipelineState TypedDict + factory
│   │   ├── config.py        # Config loader with validation
│   │   ├── routing.py       # Conditional edge routing functions
│   │   ├── serialization.py # JSONB round-trip (bytes ↔ base64)
│   │   ├── checkpoint.py    # Per-node checkpoint persistence
│   │   ├── resume.py        # Kill-and-resume logic
│   │   ├── graph.py         # StateGraph assembly
│   │   ├── api.py           # FastAPI endpoints (POST /runs, /runs/{id}/resume)
│   │   └── polling.py       # Human review polling service
│   └── main.py              # FastAPI entrypoint
├── tests/
│   ├── test_schema/         # Schema property tests (14 properties)
│   └── pipeline/            # Pipeline tests (489 tests, 16 PBT properties)
├── docker-compose.yml       # PostgreSQL 16 + pgvector
└── pyproject.toml
```

## Status

- [x] Core PostgreSQL schema (7 migrations, 10 tables, triggers, indexes)
- [x] SQLAlchemy models with OCC
- [x] Schema property tests (14 properties, all passing)
- [x] **LangGraph pipeline implementation** (10 nodes, routing, checkpoint, resume)
- [x] **Pipeline property tests** (16 correctness properties via Hypothesis)
- [x] **FastAPI endpoints** (run creation, resume)
- [x] **Polling service** (decision completeness checks, reminders)
- [ ] LangGraph runtime integration (requires `langgraph` package)
- [ ] MCP + React UI + cost tracking

## Running

```bash
# Start PostgreSQL
docker compose up -d postgres

# Apply migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/docdb python migrations/run_migrations.py

# Run all tests
python -m pytest tests/ -v

# Run pipeline tests only
python -m pytest tests/pipeline/ -v
```
