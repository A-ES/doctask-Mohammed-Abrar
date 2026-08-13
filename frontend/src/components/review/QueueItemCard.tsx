import { QueueItem } from "@/types/review";
import { STATUS_COLORS } from "@/utils/constants";

export interface QueueItemCardProps {
  item: QueueItem;
  isSelected: boolean;
  isLoading: boolean;
  onClick: () => void;
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  finding: "FINDING",
  conflict: "CONFLICT",
  proposed_update: "UPDATE",
};

export function QueueItemCard({
  item,
  isSelected,
  isLoading,
  onClick,
}: QueueItemCardProps) {
  const summary = item.payload.summary;
  const truncatedSummary =
    summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;

  const statusClasses =
    STATUS_COLORS[item.status] ?? "bg-gray-500/20 text-gray-400 border-gray-500/40";

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-busy={isLoading}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      className={`
        relative cursor-pointer rounded-lg border p-3 transition-colors
        bg-charcoal-800 border-charcoal-600 hover:border-charcoal-400
        focus:outline-none focus:ring-2 focus:ring-blue-500
        ${isSelected ? "ring-2 ring-blue-400 bg-navy-800 border-blue-500" : ""}
      `}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-end rounded-lg bg-charcoal-800/60 pr-3">
          <svg
            className="h-5 w-5 animate-spin text-blue-400"
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
        </div>
      )}

      {/* Header row: item_type badge + status chip */}
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
          {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses}`}
        >
          {item.status}
        </span>
      </div>

      {/* Summary */}
      <p className="mt-2 text-sm leading-snug text-gray-200">
        {truncatedSummary}
      </p>
    </div>
  );
}
