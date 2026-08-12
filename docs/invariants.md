# Invariants

## Checkpointed Resumability

These invariants are absolute — violations are treated as system bugs, never acceptable trade-offs.

1. **Never re-run a completed node's side effects on resume.** When a run is
   resumed after a crash, nodes whose checkpoint has been durably written must
   NOT execute again. The system skips directly to the next un-checkpointed
   node. Re-execution could cause duplicate writes, duplicate API calls, or
   data corruption.

2. **Never lose an in-flight decision.** If a human reviewer submits an
   approval/rejection decision, that decision must be durable before the
   pipeline acknowledges it. A crash after acknowledgement but before
   checkpoint must not discard the decision — the decision is the
   authoritative record, and the pipeline must recover it on resume.

3. **Never leave a run in an ambiguous state if killed between two node
   transitions.** At any instant, a run is in exactly one of:
   - The last checkpointed node completed, next node has not started.
   - A node is actively running (its `run_steps` row has status='running',
     ended_at=NULL).

   On resume, any row with status='running' and ended_at=NULL is marked
   'failed' (orphan cleanup) before determining the restart point. There is
   no window where two nodes appear simultaneously "in progress" for the
   same run, and no window where it is unclear which node should run next.

## Concurrent Run Isolation

4. **Never interleave writes between concurrent runs in a way that corrupts
   either run's state.** Two runs against the same document pile — whether
   they are different piles or the same pile hit twice — must execute with
   full isolation. Specifically:

   - Each run's `run_steps` rows are scoped by `run_id`. A checkpoint write
     for run A must never overwrite, duplicate, or interleave with run B's
     checkpoint rows.
   - Shared mutable state (e.g. document status columns, claim records) must
     be protected by per-run_id advisory locks so that concurrent runs
     serialize access to any shared row.
   - On completion, each run must contain exactly the set of results it
     produced — no duplicates from the other run, no missing entries caused
     by a lost update.

   The implementation uses per-run_id scoping (all store operations filter
   on `run_id`) combined with threading locks on the store to prevent
   data races. In production Postgres, this maps to row-level locking via
   `SELECT ... FOR UPDATE` or advisory locks per run_id.

## Approval Gate Isolation

5. **Approving or rejecting one queue item must never discard or corrupt
   other items in the same batch.** The approval queue holds pending items
   (findings, conflicts, proposed updates) tied to a `run_id`. Each item
   is decided independently:

   - Rejecting item X has zero effect on item Y's committed state.
   - Approving item Y does not modify, delete, or change the status of
     any other item in the queue.
   - Decisions are atomic per-item: a decision write either fully succeeds
     (status transitions from 'pending' to 'approved'/'rejected', decision
     row is recorded) or fully fails (item remains 'pending'). There is no
     partial state.
   - The queue must be drivable programmatically (REST endpoint), not only
     via UI. A program must be able to approve/reject items without human
     interaction.

## Finding Integrity (Rules Checking Stage)

6. **Findings are produced if and only if a rule evaluation returns verdict
   "fail".** The rules checking stage never pads, forces, or synthesizes
   findings. Specifically:

   - A Finding is produced only when `verdict == "fail"`. Verdicts of
     `pass`, `not_applicable`, or `insufficient_evidence` never produce
     findings.
   - When no rules are violated, the findings list is empty — never
     populated with synthetic entries.
   - Every Finding carries the exact source span (start_offset, end_offset,
     text) that triggered the violation. Offsets are absolute positions in
     the original document.
   - Every Finding records the evaluation_method ("llm" or "structured")
     that produced it.

7. **Adding a compliance rule never requires modifying Python source files.**
   New rules are added by editing YAML playbook files under `rules/`. The
   pipeline evaluates any rule present in a valid playbook without code
   changes. This is validated by test (`test_extensibility.py`).

8. **Rule evaluation errors are correctly classified.** LLM API failures
   produce transient errors (retryable). Unknown playbook IDs or invalid
   YAML produce permanent errors (stop immediately). Zero applicable rules
   or zero source spans produce empty findings with status "completed" — 
   never an error state.
