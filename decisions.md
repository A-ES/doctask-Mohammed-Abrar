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
