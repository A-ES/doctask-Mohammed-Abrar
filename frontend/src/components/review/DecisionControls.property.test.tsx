import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { render, within, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DecisionControls } from "./DecisionControls";
import type {
  QueueItem,
  QueueItemPayload,
  SourceCitation,
  ItemType,
  ItemStatus,
} from "@/types/review";

// --- Arbitraries ---

const itemTypeArb: fc.Arbitrary<ItemType> = fc.constantFrom(
  "finding",
  "conflict",
  "proposed_update"
);

const itemStatusArb: fc.Arbitrary<ItemStatus> = fc.constantFrom(
  "pending",
  "approved",
  "rejected"
);

const nonPendingStatusArb: fc.Arbitrary<ItemStatus> = fc.constantFrom(
  "approved" as const,
  "rejected" as const
);

const sourceCitationArb: fc.Arbitrary<SourceCitation> = fc.record({
  claim_id: fc.uuid(),
  claim_text: fc.string({ minLength: 1, maxLength: 100 }),
  citation_status: fc.constantFrom(
    "grounded" as const,
    "unverifiable" as const
  ),
  source_location: fc.option(
    fc.record({
      page_number: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
      section_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
        nil: null,
      }),
      start_offset: fc.nat({ max: 10000 }),
      end_offset: fc.nat({ max: 10000 }),
      clause_ref: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
        nil: null,
      }),
    }),
    { nil: null }
  ),
});

const queueItemPayloadArb: fc.Arbitrary<QueueItemPayload> = fc.record({
  summary: fc.string({ minLength: 1, maxLength: 200 }),
  details: fc.constant({} as Record<string, unknown>),
  source_citations: fc.array(sourceCitationArb, {
    minLength: 0,
    maxLength: 3,
  }),
});

const queueItemArb = (status: fc.Arbitrary<ItemStatus>): fc.Arbitrary<QueueItem> =>
  fc.record({
    id: fc.uuid(),
    run_id: fc.uuid(),
    item_type: itemTypeArb,
    payload: queueItemPayloadArb,
    status,
    queued_at: fc.date().map((d) => d.toISOString()),
    decided_at: fc.option(fc.date().map((d) => d.toISOString()), {
      nil: null,
    }),
    decision: fc.option(
      fc.constantFrom("approved" as const, "rejected" as const),
      { nil: null }
    ),
    reviewer_id: fc.option(fc.uuid(), { nil: null }),
    justification: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: null,
    }),
  });

/** Generates empty or whitespace-only strings */
const emptyOrWhitespaceArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), {
    minLength: 1,
    maxLength: 20,
  })
);

/** Generates non-empty strings that contain at least one non-whitespace character */
const nonEmptyNonWhitespaceArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.char().filter((c) => c.trim().length > 0),
    fc.string({ minLength: 0, maxLength: 10 })
  )
  .map(([prefix, char, suffix]) => prefix + char + suffix);

// --- Tests ---

describe("DecisionControls Property Tests", () => {
  /**
   * Property 5: Decision Button Visibility
   *
   * For any QueueItem, Approve and Reject buttons SHALL be visible if and only
   * if the item's status is "pending". For items with status "approved" or
   * "rejected", no decision buttons should be rendered.
   *
   * **Validates: Requirements 3.2, 3.6**
   */
  describe("Property 5: Decision Button Visibility", () => {
    it("Approve and Reject buttons are rendered when status is pending", () => {
      fc.assert(
        fc.property(queueItemArb(fc.constant("pending" as ItemStatus)), (item) => {
          const { unmount } = render(
            <DecisionControls
              item={item}
              onDecide={() => {}}
              isSubmitting={false}
            />
          );

          const approveButton = screen.queryByRole("button", {
            name: /approve/i,
          });
          const rejectButton = screen.queryByRole("button", {
            name: /reject/i,
          });

          expect(approveButton).toBeInTheDocument();
          expect(rejectButton).toBeInTheDocument();

          unmount();
        }),
        { numRuns: 100 }
      );
    });

    it("Approve and Reject buttons are NOT rendered when status is not pending", () => {
      fc.assert(
        fc.property(queueItemArb(nonPendingStatusArb), (item) => {
          const { unmount } = render(
            <DecisionControls
              item={item}
              onDecide={() => {}}
              isSubmitting={false}
            />
          );

          const approveButton = screen.queryByRole("button", {
            name: /approve/i,
          });
          const rejectButton = screen.queryByRole("button", {
            name: /reject/i,
          });

          expect(approveButton).not.toBeInTheDocument();
          expect(rejectButton).not.toBeInTheDocument();

          unmount();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Justification Required
   *
   * For any pending QueueItem and any justification text that is empty or
   * whitespace-only, the decision buttons SHALL be disabled (submission blocked).
   * For non-empty non-whitespace justification, buttons SHALL be enabled.
   *
   * **Validates: Requirements 3.3**
   */
  describe("Property 6: Justification Required", () => {
    it("buttons are disabled when justification is empty or whitespace-only", async () => {
      await fc.assert(
        fc.asyncProperty(
          queueItemArb(fc.constant("pending" as ItemStatus)),
          emptyOrWhitespaceArb,
          async (item, whitespaceText) => {
            const user = userEvent.setup();

            const { unmount } = render(
              <DecisionControls
                item={item}
                onDecide={() => {}}
                isSubmitting={false}
              />
            );

            // Type the whitespace/empty text into the justification textarea
            const textarea = screen.getByLabelText(/decision justification/i);
            if (whitespaceText.length > 0) {
              await user.clear(textarea);
              await user.type(textarea, whitespaceText);
            }

            const approveButton = screen.getByRole("button", {
              name: /approve/i,
            });
            const rejectButton = screen.getByRole("button", {
              name: /reject/i,
            });

            expect(approveButton).toBeDisabled();
            expect(rejectButton).toBeDisabled();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("buttons are enabled when justification has non-whitespace content", async () => {
      await fc.assert(
        fc.asyncProperty(
          queueItemArb(fc.constant("pending" as ItemStatus)),
          nonEmptyNonWhitespaceArb,
          async (item, justificationText) => {
            const user = userEvent.setup();

            const { unmount } = render(
              <DecisionControls
                item={item}
                onDecide={() => {}}
                isSubmitting={false}
              />
            );

            // Type meaningful justification text
            const textarea = screen.getByLabelText(/decision justification/i);
            await user.clear(textarea);
            await user.type(textarea, justificationText);

            const approveButton = screen.getByRole("button", {
              name: /approve/i,
            });
            const rejectButton = screen.getByRole("button", {
              name: /reject/i,
            });

            expect(approveButton).toBeEnabled();
            expect(rejectButton).toBeEnabled();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
