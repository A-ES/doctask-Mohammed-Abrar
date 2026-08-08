# tests/

Two test suites: schema correctness (PostgreSQL) and pipeline logic (pure Python).

## Schema Tests (`tests/test_schema/`) — 14 properties

Require PostgreSQL running via `docker compose up -d postgres`.

| File | Properties | Validates |
|------|-----------|-----------|
| `test_source_locations.py` | 5 | start_offset < end_offset CHECK |
| `test_resume_query.py` | 6 | Resume query returns highest completed step |
| `test_run_status.py` | 7 | Run status state machine transitions |

## Pipeline Tests (`tests/pipeline/`) — 489 tests

Pure Python, no database required. Includes unit tests and 16 property-based tests.

### Unit Tests

| File | Covers |
|------|--------|
| `test_state.py` | PipelineState TypedDict + factory |
| `test_config.py` | Config loader, defaults, validation |
| `test_serialization.py` | JSONB round-trip (bytes ↔ base64) |
| `test_routing.py` | All routing conditions per node |
| `test_checkpoint.py` | Checkpoint persistence layer |
| `test_resume.py` | Resume logic + lock acquisition |
| `test_graph.py` | Graph topology (nodes, edges, path maps) |
| `test_api.py` | FastAPI endpoints (create run, resume) |
| `test_polling.py` | Polling service (resume, reminders) |
| `test_nodes_*.py` | Individual node behavior (10 files) |

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

## Running

```bash
# All tests
python -m pytest tests/ -v

# Pipeline tests only (no DB needed)
python -m pytest tests/pipeline/ -v

# Schema tests only (needs PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/docdb_test python -m pytest tests/test_schema/ -v
```
