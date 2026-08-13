import { useState } from "react";
import type { QueueItem } from "@/types/review";

export interface DecisionControlsProps {
  item: QueueItem;
  onDecide: (decision: "approved" | "rejected", justification: string) => void;
  isSubmitting: boolean;
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Renders Approve/Reject buttons with a justification textarea.
 * Buttons are only visible when item status is "pending".
 * Submission is blocked when justification is empty or whitespace-only.
 */
export function DecisionControls({
  item,
  onDecide,
  isSubmitting,
}: DecisionControlsProps) {
  const [justification, setJustification] = useState("");

  const isPending = item.status === "pending";
  const trimmed = justification.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  if (!isPending) {
    return (
      <section aria-label="Decision controls">
        <p className="text-sm text-gray-400">
          Decision:{" "}
          <span className="font-medium capitalize text-gray-200">
            {item.decision ?? item.status}
          </span>
        </p>
      </section>
    );
  }

  const handleDecide = (decision: "approved" | "rejected") => {
    if (!canSubmit) return;
    onDecide(decision, trimmed);
    setJustification("");
  };

  return (
    <section aria-label="Decision controls">
      <h3 className="mb-2 text-sm font-medium text-gray-300">Decision</h3>
      <div className="space-y-3">
        <div>
          <textarea
            aria-label="Decision justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Provide justification for your decision…"
            disabled={isSubmitting}
            className="w-full rounded-md border border-charcoal-600 bg-charcoal-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            rows={3}
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleDecide("approved")}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-charcoal-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-600"
          >
            {isSubmitting && <Spinner />}
            Approve
          </button>
          <button
            type="button"
            onClick={() => handleDecide("rejected")}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-charcoal-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-600"
          >
            {isSubmitting && <Spinner />}
            Reject
          </button>
        </div>
      </div>
    </section>
  );
}
