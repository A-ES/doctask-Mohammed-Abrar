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