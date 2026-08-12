# Decisions of TASK-1

## 2026-08-07 – Document domain selection

**Decision:** Microfinance and consumer loan agreements (Financial Compliance & Credit Auditing)

**Why this domain:**
- hands-on experience building a detection engine (Predatory learning rate in microfinance) that scanned microfinance loan agreements, extracted financial terms, calculated true APR, and flagged predatory clauses (illegal processing fees, missing Key Facts Statements, etc.)
- This domain naturally surfaces the exact problems the agentic system must solve: cross-document consistency, precise numerical extraction, rule-based compliance checking, and clear source attribution
- Easy to create high-quality synthetic documents with intentional violations and contradictions for rigorous testing
- Strong real-world relevance for audit, compliance, and credit-risk teams


## 2026-08-07 – Agent orchestration: LangGraph

**Decision:** Use LangGraph as the core orchestration framework.

**Why?**  
Purpose-built for exactly the floor requirements: typed persistent state, checkpointers (kill mid-run → resume from last checkpoint is a first-class feature, not something you bolt on), conditional edges for retry/skip/escalate, and interrupt() nodes designed specifically for human-in-the-loop gates that pause and resume execution.

## 2026-08-08 – Core Postgres schema

**Decision:** Adopt the full schema defined in the Requirements Document (documents, document_versions, claims, source_locations, runs, run_steps, approval_queue, decisions, audit_events).

**Why:**
- Every claim must be traceable to an exact source location → mandatory source_locations + foreign keys.
- Killed runs must resume cleanly → explicit runs + run_steps with status machine.
- Concurrent runs must not corrupt each other → run_id scoping on claims + optimistic version columns.
- Full “what changed, when, why” → append-only audit_events written in the same transaction as the change.
- Human approve/reject is item-by-item and durable → approval_queue + decisions with uniqueness constraints.

**Alternatives considered:**  
Simpler “current state only” tables, soft deletes, or reconstructing history from logs. Rejected because they fail the auditability and resumability requirements.


## 2026-08-12 – Microfinance ingestion pipeline: type-specific extraction

**Decision:** Add a `classify_document` node between `extract_text` and `chunk` that routes to type-specific extractors (loan, modification, repayment) via a strategy registry.

**Why:**
- Classification must happen before chunking because document type determines optimal chunk boundaries (clause-level for loans, row-level for repayments).
- Strategy pattern with a registry means new document types are added by implementing one class and registering it — no graph wiring changes.
- Each extractor produces `ExtractedFact` with `SourceSpan`, enabling end-to-end provenance (every fact links to exact character offsets in source text).

**Alternatives considered:**
- Extending `extract_claims` to do classification inline. Rejected: chunking strategy depends on type, so classification must precede it.
- Single generic extractor for all types. Rejected: domain-specific field sets and normalization rules differ too much between loan agreements, modifications, and repayment statements.


## 2026-08-12 – Rules checking stage: YAML-driven compliance playbooks

**Decision:** Add a parallel `match_rules_against_sources` node that evaluates compliance rules defined entirely in YAML, with LLM as default evaluator and structured checks as opt-in.

**Why:**
- Hard requirement: adding a rule must never touch `.py` files. YAML playbooks achieve this — new rules are a file edit, reviewed in git diff.
- Parallel fan-out (existing `match_rules` for claims + new node for source spans) catches violations from both angles without serializing evaluation.
- LLM default handles open-ended regulatory language; `check_type: structured` opt-in gives determinism/speed for simple numeric comparisons.
- `playbook_id` whitelist prevents path traversal and makes playbook selection an auditable per-run choice.

**Alternatives considered:**
- Python plugin system (register callable per rule). Rejected: violates the "no .py changes for new rules" constraint.
- Single evaluator for all rules. Rejected: some rules (rate comparisons) benefit from deterministic structured checks without LLM latency/cost.
- Replacing `match_rules` entirely. Rejected: claim-scope rules and source-scope rules need different evidence; both perspectives are valid.
