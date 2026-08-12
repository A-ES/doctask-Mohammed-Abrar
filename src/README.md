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

LangGraph pipeline implementation — 3 stages, 13 nodes, conditional routing.

### Core Modules

| Module | Purpose |
|--------|---------|
| `state.py` | `PipelineState` TypedDict, supporting types, `create_initial_state()` |
| `config.py` | `load_config()` with defaults and constraint validation |
| `routing.py` | `make_routing_fn()` factory — per-node conditional edge logic |
| `serialization.py` | `serialize_state()` / `deserialize_state()` (bytes ↔ base64) |
| `checkpoint.py` | `write_checkpoint()` / `create_step_row()` — per-node snapshots |
| `resume.py` | `resume_run()` — restore from last checkpoint, determine next node |
| `executor.py` | `ResumableExecutor` — sequential node runner with checkpoint-based skip-on-resume |
| `stores.py` | `ThreadSafeCheckpointStore` — thread-safe in-memory store for concurrent execution |
| `approval.py` | `ApprovalService` + `InMemoryApprovalStore` — queue management, per-item atomic decisions |
| `approval_api.py` | FastAPI router: `POST /approval/items/{id}/decide`, queue listing |
| `graph.py` | `build_graph()` — StateGraph assembly with all nodes and edges |
| `api.py` | FastAPI router: `POST /runs`, `POST /runs/{id}/resume` |
| `polling.py` | `PollingService` — checks decisions, triggers resume, sends reminders |
| `playbook.py` | Pydantic playbook schema (`RuleDefinition`, `Playbook`), loader, rule partitioner |
| `evaluators.py` | `RuleEvaluator` protocol, `LLMEvaluator` (batch), `StructuredEvaluator` (deterministic) |
| `findings.py` | `CitedSpan`, `EvaluationResult`, `Finding` dataclasses + type aliases |

### Nodes (`src/pipeline/nodes/`)

| Node | Stage | Responsibility |
|------|-------|---------------|
| `ingest` | Understand | Load document bytes, validate MIME |
| `extract_text` | Understand | Convert to plain text (skip if already text) |
| `classify_document` | Understand | Route to type-specific extractor |
| `chunk` | Understand | Split text into overlapping segments |
| `embed` | Understand | Generate + store vector embeddings |
| `extract_claims` | Examine | Identify factual assertions via LLM |
| `match_rules` | Examine | Compare claims against compliance rules |
| `match_rules_against_sources` | Examine | Evaluate rules directly against source spans |
| `merge_findings` | Examine | Merge claim-based and source-based findings |
| `score_confidence` | Examine | Refine scores, flag for human review |
| `route_to_queue` | Stay-Alive | Partition into approve/escalate/reject |
| `human_review` | Stay-Alive | Interrupt for human decisions |
| `finalize` | Stay-Alive | Write results, close run, emit audit events |

## Executor & Stores (`src/pipeline/executor.py`, `stores.py`)

The `ResumableExecutor` runs a sequence of nodes with checkpoint-based resumability:

- On first run: executes all nodes sequentially from the beginning.
- On resume (same `run_id`, same store): skips already-checkpointed nodes, continues from next.
- Acquires per-`run_id` lock to prevent double-execution of the same run.
- Accepts a `crash_after` parameter for testing (simulates process kill between transitions).

`ThreadSafeCheckpointStore` provides a thread-safe in-memory store for concurrent execution testing. All operations are serialized via `threading.Lock`, simulating Postgres row-level locking.

### Invariants Enforced

See `docs/invariants.md`:
1. Never re-run a completed node's side effects on resume.
2. Never lose an in-flight decision.
3. Never leave a run in an ambiguous state if killed between transitions.
4. Never interleave writes between concurrent runs.

## Approval Gate (`src/pipeline/approval.py`, `approval_api.py`)

Programmatic approve/reject for queued items (findings, conflicts, proposed updates).

### Queue Model

- Items are scoped by `run_id` (a batch = all pending items for a run).
- Lifecycle: `pending` → `approved` | `rejected` (one-way, atomic per-item).
- Decisions record `reviewer_id`, `justification`, and `decided_at`.

### REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/approval/runs/{run_id}/queue` | GET | List all items for a run |
| `/approval/items/{item_id}` | GET | Get a single item |
| `/approval/items/{item_id}/decide` | POST | Approve or reject (the callable operation) |

**Request body** for `/decide`:
```json
{
  "decision": "approved",
  "reviewer_id": "bot-alpha",
  "justification": "Claim verified against source"
}
```

### Invariant 5

Approving or rejecting one item has zero effect on other items in the same batch. Decisions are atomic per-item.
