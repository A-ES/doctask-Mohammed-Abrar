# Agentic Document Intelligence — Microfinance Compliance

An end-to-end pipeline that ingests a "pile" of financial documents, extracts structured facts with source provenance, evaluates compliance rules, and surfaces findings for human approval — with full checkpointed resumability and concurrent-run isolation.

---

## Quick Start (one command)

Prerequisites: **Docker**, **Docker Compose v2**, and [**uv**](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager).

```bash
make demo
```

This single command:

1. Builds and starts PostgreSQL 16 + pgvector and the FastAPI service (`docker compose up`)
2. Applies all 8 database migrations (schema, tables, triggers, indexes)
3. Generates a deterministic 5-document synthetic pile and seeds it into the database

After it completes:

| Service    | URL                              |
|------------|----------------------------------|
| API        | http://localhost:8000/health      |
| PostgreSQL | `localhost:5432` (postgres/postgres/docdb) |

To bring everything down: `make down` (or `make clean` to also wipe the volume).

---

## Supported Document Formats

| Format | MIME Type | Notes |
|--------|-----------|-------|
| **PDF** | `application/pdf` | Parsed via text extraction layer; scanned PDFs not yet supported |
| **DOCX** | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Standard Office Open XML |
| **Plain text** | `text/plain` | Direct ingestion, no conversion step |

The pipeline determines format at the `ingest` node via MIME detection. Adding support for a new format requires only a new text-extraction adapter in `src/pipeline/nodes/extract_text.py` — no graph changes.

---

## Domain

**Microfinance and consumer loan compliance** (Financial Compliance & Credit Auditing).

The system is purpose-built for document piles containing:

- Loan agreements (principal, rate, tenure, fees, penal clauses)
- Modification agreements (rate reductions, moratoriums, term changes)
- Repayment statements (tabular or narrative payment histories)

Compliance rules live in YAML playbooks under `rules/`. The shipped playbook (`microfinance_v1`) checks:

| Rule | Description |
|------|-------------|
| MF-001 | APR must not exceed 36% |
| MF-002 | Processing fee must be disclosed |
| MF-003 | Interest rate must match latest modification |
| MF-004 | Late payment penalty must not exceed 5% of outstanding |

A second evaluation with different documents works without code changes — drop new files in the same declared formats (PDF, DOCX, or plain text) within the microfinance/consumer-loan domain, and the existing pipeline + rules apply as-is. To add domain-specific rules, edit or add YAML in `rules/` (no Python changes required).

---

## Architecture Decisions — What We Cut and Why

| Decision | What was cut | Why |
|----------|-------------|-----|
| **No LangGraph runtime** | The `langgraph` package is declared as a dependency but the pipeline runs on a custom `ResumableExecutor` with the same checkpoint/resume semantics | LangGraph's runtime was not yet stable enough to warrant coupling; our executor gives identical guarantees (tested via kill-and-resume property tests) while keeping the graph topology portable to LangGraph when ready |
| **No real LLM calls** | Extraction and rule evaluation use protocol-based interfaces with mock implementations in tests | Avoids API-key gating for evaluators; production wiring is a config switch, not a code change |
| **No scanned-PDF OCR** | Only text-layer PDFs are supported | OCR adds Tesseract/cloud-vision dependencies and latency; the compliance domain primarily uses digitally-generated loan docs |
| **No React UI in Docker** | Frontend is a separate Vite dev server, not containerized | Keeps the backend image small and CI fast; the frontend is stateless and talks to the API over localhost |
| **No cloud deployment** | Docker Compose for local only | Scope is demo + evaluation; production would add Terraform/CDK, secrets management, and multi-region Postgres — all out of scope for this prototype |
| **Regex extraction as default** | LLM-based extraction is identified as necessary (see DECISIONS.md) but not yet wired as default | The regex extractors are deterministic and fully tested; LLM default is the next planned change |
| **No embedding service** | The `embed` node is a no-op stub | pgvector schema is ready; real embeddings require an API key and add cost per document |
| **No authentication** | API is unauthenticated | Prototype scope; production would add JWT/OAuth middleware |

---

## Project Structure

```
├── scripts/
│   └── seed_demo.py           # Generates + inserts the synthetic demo pile
├── rules/                     # YAML compliance playbooks (no code edits to add rules)
├── migrations/                # Sequential SQL migrations (001–008)
├── src/
│   ├── models/                # SQLAlchemy models (10 tables)
│   ├── pipeline/
│   │   ├── nodes/             # 13 async pipeline nodes
│   │   ├── extractors/        # Type-specific extractors (loan, modification, repayment)
│   │   ├── graph.py           # StateGraph assembly
│   │   ├── executor.py        # ResumableExecutor (checkpoint-based runner)
│   │   ├── approval.py        # Approval gate + in-memory store
│   │   ├── services.py        # Shared service layer (REST + MCP)
│   │   └── ...                # Config, routing, playbook, evaluators, etc.
│   ├── mcp_server.py          # MCP server (6 tools, stdio transport)
│   └── main.py                # FastAPI entrypoint
├── tests/
│   ├── synthetic/             # Deterministic document generators
│   ├── pipeline/              # 870+ tests (25 property-based)
│   ├── test_resumability.py   # Kill-and-resume invariant tests
│   ├── test_concurrency.py    # Run isolation tests
│   └── test_mcp_integration.py # End-to-end via MCP tools
├── frontend/                  # React + Vite review interface
├── docker-compose.yml         # PostgreSQL 16 + pgvector, API service
├── Dockerfile                 # Python 3.11-slim, uv-based
├── Makefile                   # make demo = up + migrate + seed
└── pyproject.toml
```

---

## Running Tests

```bash
# All tests (no database needed for pipeline + invariant tests)
make test

# Schema tests (requires running Postgres — run 'make up' first)
make test-schema
```

---

## MCP Server

The system is also available as an MCP server (stdio transport) exposing the same operations as the REST API through 6 tools: `start_run`, `get_run_status`, `list_pending_approvals`, `decide_approval`, `get_deliverable`, `get_change_history`.

```bash
uv run python -m src.mcp_server
```

---

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make demo` | **The one command** — up + migrate + seed |
| `make up` | Start containers |
| `make down` | Stop containers |
| `make clean` | Stop + wipe volumes |
| `make migrate` | Apply SQL migrations |
| `make seed` | Insert synthetic demo pile |
| `make test` | Run test suite |
| `make frontend` | Start Vite dev server |
