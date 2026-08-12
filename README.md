# supa_doccs

Document intelligence pipeline for synthetic microfinance and consumer loan compliance analysis.

## Domain & Formats

**Domain:** Microfinance and consumer loan agreements (Financial Compliance & Credit Auditing)
**Formats:** PDF, DOCX, plain text

## Architecture

- **Pipeline:** LangGraph StateGraph with 13 nodes across 3 stages (Understand → Examine → Stay-Alive)
- **Classification:** `classify_document` node routes to type-specific extractors (loan, modification, repayment)
- **Extraction:** Regex-based extractors produce `ExtractedFact` with `SourceSpan` provenance pointers
- **Rules Checking:** YAML-driven compliance rules evaluated via LLM (default) or structured checks; parallel `match_rules` + `match_rules_against_sources` fan-out
- **Persistence:** PostgreSQL 16 + pgvector; all run state checkpointed as JSONB
- **Resumability:** Per-node checkpoints with advisory locks; killed runs resume from last completed step
- **Routing:** Conditional edges with retry (bounded), skip, and escalate logic
- **Human gate:** Item-by-item approve/reject via interrupt node + polling service
- **Concurrency:** Per-run_id advisory locks + OCC version columns
- **Audit:** Append-only `audit_events` table with trigger protection

## Project Structure

```
├── rules/                   # YAML compliance playbooks (no .py edits to add rules)
├── migrations/              # Sequential SQL migrations (001–007)
├── docs/
│   └── invariants.md        # System invariants (resumability, concurrency, approval)
├── src/
│   ├── models/              # SQLAlchemy declarative models (10 tables)
│   ├── pipeline/
│   │   ├── nodes/           # 13 async pipeline nodes (incl. classify_document, match_rules_against_sources, merge_findings)
│   │   ├── extractors/      # Type-specific extractors (loan, modification, repayment) + registry
│   │   ├── state.py         # PipelineState TypedDict + factory
│   │   ├── config.py        # Config loader with validation
│   │   ├── routing.py       # Conditional edge routing functions
│   │   ├── playbook.py      # Pydantic playbook schema, loader, rule partitioner
│   │   ├── evaluators.py    # RuleEvaluator protocol, LLM + structured implementations
│   │   ├── findings.py      # CitedSpan, EvaluationResult, Finding dataclasses
│   │   ├── source_linker.py # SourceLinker + persist_fact
│   │   ├── serialization.py # JSONB round-trip (bytes ↔ base64)
│   │   ├── checkpoint.py    # Per-node checkpoint persistence
│   │   ├── resume.py        # Kill-and-resume logic
│   │   ├── executor.py      # ResumableExecutor — checkpointed sequential runner
│   │   ├── stores.py        # ThreadSafeCheckpointStore (concurrent execution)
│   │   ├── approval.py      # Approval gate service + in-memory store
│   │   ├── approval_api.py  # REST endpoints for programmatic approve/reject
│   │   ├── services.py      # Shared service layer (called by both REST + MCP)
│   │   ├── graph.py         # StateGraph assembly (13 nodes + fan-out)
│   │   ├── api.py           # FastAPI endpoints (POST /runs, /runs/{id}/resume)
│   │   └── polling.py       # Human review polling service
│   ├── mcp_server.py        # MCP server (6 tools, stdio transport)
│   └── main.py              # FastAPI entrypoint
├── tests/
│   ├── test_schema/         # Schema property tests (14 properties)
│   ├── pipeline/            # Pipeline tests (870+ tests, 25 PBT properties)
│   ├── microfinance/        # Microfinance extraction property tests (20 properties) + E2E provenance
│   ├── synthetic/           # Synthetic document generator + tests
│   ├── test_resumability.py # Kill-and-resume invariant tests
│   ├── test_concurrency.py  # Concurrent run isolation tests
│   ├── test_approval_gate.py # Approval gate endpoint + independence tests
│   └── test_mcp_integration.py # Full pile end-to-end via MCP tools only
├── docker-compose.yml       # PostgreSQL 16 + pgvector
└── pyproject.toml
```

## Status

- [x] Core PostgreSQL schema (7 migrations, 10 tables, triggers, indexes)
- [x] SQLAlchemy models with OCC
- [x] Schema property tests (14 properties, all passing)
- [x] **LangGraph pipeline implementation** (11 nodes, routing, checkpoint, resume)
- [x] **Pipeline property tests** (16 correctness properties via Hypothesis)
- [x] **Microfinance ingestion pipeline** (classify → extract → source-link, 20 properties, 807 tests)
- [x] **FastAPI endpoints** (run creation, resume)
- [x] **Polling service** (decision completeness checks, reminders)
- [x] **Checkpointed resumability** (executor with kill-and-resume, tested)
- [x] **Concurrent run isolation** (per-run_id locking, thread-safe store, tested)
- [x] **Approval gate** (programmatic REST approve/reject, queue independence, tested)
- [x] **Rules checking stage** (YAML playbooks, LLM + structured evaluators, 58 tests, 9 PBT properties)
- [x] **MCP server** (6 tools mirroring REST, shared service layer, full integration test)
- [ ] LangGraph runtime integration (requires `langgraph` package)
- [ ] React UI + cost tracking

## MCP Server

The system is also exposed as an MCP (Model Context Protocol) server. Both the REST API and MCP tools call the same shared service functions — no separate logic paths.

### Tools

| Tool | Equivalent REST | Purpose |
|------|----------------|---------|
| `start_run` | `POST /runs` | Start a new pipeline run (upload a pile) |
| `get_run_status` | `POST /runs/{id}/resume` | Query run status and next node |
| `list_pending_approvals` | `GET /approval/runs/{id}/queue` | List approval queue items |
| `decide_approval` | `POST /approval/items/{id}/decide` | Approve or reject an item |
| `get_deliverable` | — | Get current deliverable with section hashes |
| `get_change_history` | `GET /runs/{id}/history` | Get audit trail for a run |

### Running the MCP server

```bash
python -m src.mcp_server
```

The server uses stdio transport and can be configured in any MCP-compatible client.

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

# Run MCP integration test
python -m pytest tests/test_mcp_integration.py -v
```
