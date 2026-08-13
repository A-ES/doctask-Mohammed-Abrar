import type { QueueItem } from "@/types/review";
import { PayloadView } from "./PayloadView";
import { CitationList } from "./CitationList";
import { SourceLocationTable } from "./SourceLocationTable";
import { DecisionControls } from "./DecisionControls";

export interface DetailPanelProps {
  item: QueueItem | null;
  onDecide: (decision: "approved" | "rejected", justification: string) => void;
  isSubmitting: boolean;
}

/**
 * Detail panel composing PayloadView, CitationList, SourceLocationTable,
 * and DecisionControls. Shows a placeholder when no item is selected.
 */
export function DetailPanel({ item, onDecide, isSubmitting }: DetailPanelProps) {
  if (item === null) {
    return (
      <div
        className="flex h-full items-center justify-center text-gray-500"
        aria-label="Detail panel"
      >
        <p className="text-sm">Select an item to review</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto p-4"
      aria-label="Detail panel"
    >
      <PayloadView item={item} />

      <CitationList citations={item.payload.source_citations} />

      <SourceLocationTable citations={item.payload.source_citations} />

      <DecisionControls
        item={item}
        onDecide={onDecide}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
