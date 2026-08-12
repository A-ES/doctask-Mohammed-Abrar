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


## 2026-08-12 – Extraction brittleness: LLM-based extraction as default

**Decision (PENDING):** Make LLM-based extraction the default strategy for all extractors, keeping regex/structured matching only as an optional fast-path for fields with genuinely fixed, template-mandated formats.

**Evidence (from `tests/test_paraphrased_extraction.py`):**

A paraphrased pile expressing identical facts (same rate, same parties, same tenure, same conflicts) but with natural language variation produced:

| Document Type | Template Coverage | Paraphrased Coverage | Gap |
|---|---|---|---|
| Loan Agreement | 9/9 (100%) | 3/18 across 2 docs (17%) | 83% fields missed |
| Modification | 2 changes found | 0 changes found | 100% missed |
| Repayment (tabular) | 3 rows | 3 rows | ✓ (table format preserved) |
| Repayment (narrative) | 3 rows | 0 rows | 100% missed |

The regex extractors succeed only when documents follow the exact phrasing the patterns were written for. Natural rewording — "a sum of one lakh fifty thousand rupees (INR 150,000.00) as the loan corpus" instead of "Principal Amount: ₹1,50,000" — breaks extraction entirely.

**Why this is the same problem already solved in rules checking:**

The rules checking stage already made this transition: LLM is the default evaluator (handles open-ended language), structured checks are opt-in for simple numeric patterns like "rate > 36%". The extraction stage should follow the same architecture:
- LLM extraction as default — handles arbitrary phrasing
- Regex/structured as `extraction_method: structured` opt-in per field, only when the document format is genuinely template-mandated (e.g., regulatory filings with fixed column headers)

**Fields where regex fast-path remains appropriate:**
- Repayment statement rows when in standard pipe/tab-delimited table format
- Monetary values that appear in a known fixed template (e.g., bank-generated statements)

**Fields where LLM extraction is required:**
- Borrower/lender names in narrative text
- Interest rates embedded in legal prose
- Tenure/term stated in words ("twenty-four calendar months")
- Processing fees described indirectly ("administrative charge amounting to...")
- Any modification agreement in letter format

**Alternatives considered:**
- Adding more regex patterns. Rejected: infinite regression — each new phrasing requires new patterns, and the combinatorial space of natural language is unbounded.
- Hybrid approach (regex first, LLM fallback). Considered viable but adds complexity. Simpler to default to LLM and use regex only where speed/determinism is critical.
