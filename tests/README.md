# tests/

Two test suites: schema correctness (PostgreSQL) and pipeline logic (pure Python), plus integration tests for infrastructure invariants.

## Schema Tests (`tests/test_schema/`) — 14 properties

Require PostgreSQL running via `docker compose up -d postgres`.

| File | Properties | Validates |
|------|-----------|-----------|
| `test_source_locations.py` | 5 | start_offset < end_offset CHECK |
| `test_resume_query.py` | 6 | Resume query returns highest completed step |
| `test_run_status.py` | 7 | Run status state machine transitions |

## Pipeline Tests (`tests/pipeline/`) — 870+ tests

Pure Python, no database required. Includes unit tests and 25 property-based tests.

### Unit Tests

| File | Covers |
|------|--------|
| `test_state.py` | PipelineState TypedDict + factory |
| `test_config.py` | Config loader, defaults, validation |
| `test_serialization.py` | JSONB round-trip (bytes ↔ base64) |
| `test_routing.py` | All routing conditions per node |
| `test_checkpoint.py` | Checkpoint persistence layer |
| `test_resume.py` | Resume logic + lock acquisition |
| `test_graph.py` | Graph topology (13 nodes, edges, path maps) |
| `test_api.py` | FastAPI endpoints (create run, resume) |
| `test_polling.py` | Polling service (resume, reminders) |
| `test_nodes_*.py` | Individual node behavior (10 files) |
| `test_playbook_yaml.py` | Playbook YAML loading + Pydantic validation |
| `test_extensibility.py` | YAML-only rule addition (no .py changes) |
| `test_rules_checking_clean_corpus.py` | Clean corpus → zero findings |
| `test_rules_checking_violation_corpus.py` | Violation corpus → exact citation |
| `test_rules_checking_error_handling.py` | Error path coverage (permanent/transient) |

### Property-Based Tests (Hypothesis)

| File | Properties | Validates |
|------|-----------|-----------|
| `test_properties_state.py` | P6: JSONB round-trip | Serialization fidelity |
| `test_properties_routing.py` | P2: Determinism, P3: Retry, P4: Escalation, P7: Skip | Routing correctness |
| `test_properties_chunk.py` | P11: Chunk coverage | No text gaps |
| `test_properties_examine.py` | P12: Offset ordering, P13: Parity, P14: Flagging | Examine stage invariants |
| `test_properties_stay_alive.py` | P8: Partitioning, P9: Escalate routing, P15: Post-review | Stay-Alive stage |
| `test_properties_checkpoint.py` | P5: Checkpoint iff success | Checkpoint correctness |
| `test_properties_resume.py` | P10: Resume restart | Resume correctness |
| `test_properties_graph.py` | P1: Stage ordering, P16: Completion contract | Graph invariants |
| `test_properties_playbook.py` | P17: Schema round-trip, P18: Invalid ID error, P19: Partitioning, P20: Default check_type, P21: Unbounded rules | Playbook correctness |
| `test_properties_findings.py` | P22: Finding structural completeness | Finding integrity |
| `test_properties_nodes_rules.py` | P23: Merge preserves all, P24: Empty → empty, P25: Fail-only findings | Rules node correctness |

## Infrastructure Invariant Tests (`tests/test_*.py`) — 36 tests

Pure Python, no database required. Validates system-level invariants from `docs/invariants.md`.

| File | Tests | Validates |
|------|-------|-----------|
| `test_resumability.py` | 5 | Checkpointed resume: no side-effect replay, state equivalence, orphan cleanup |
| `test_concurrency.py` | 5 | Run isolation: per-run_id scoping, no interleaved writes, same-run serialization |
| `test_approval_gate.py` | 16 | Approval independence: approve/reject one item has zero effect on others (8 service + 8 REST) |
| `test_mcp_integration.py` | 5 | Full pile end-to-end via MCP tools only: start → approve → deliverable → history |
| `test_main.py` | 2 | Health endpoint baseline |

## Running

```bash
# All tests (no DB needed for pipeline + invariant tests)
python -m pytest tests/ -v --ignore=tests/test_schema

# Pipeline tests only
python -m pytest tests/pipeline/ -v

# Infrastructure invariant tests only
python -m pytest tests/test_resumability.py tests/test_concurrency.py tests/test_approval_gate.py -v

# MCP integration test only
python -m pytest tests/test_mcp_integration.py -v

# Schema tests only (needs PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/docdb_test python -m pytest tests/test_schema/ -v
```
