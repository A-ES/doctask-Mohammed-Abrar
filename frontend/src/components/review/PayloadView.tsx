import type { QueueItem } from "@/types/review";
import { STATUS_COLORS } from "@/utils/constants";

interface PayloadViewProps {
  item: QueueItem;
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  finding: "FINDING",
  conflict: "CONFLICT",
  proposed_update: "UPDATE",
};

/**
 * Renders the full payload details of a queue item including summary,
 * item_type badge, queued_at date, status, and details key-value pairs.
 */
export function PayloadView({ item }: PayloadViewProps) {
  const statusClasses =
    STATUS_COLORS[item.status] ?? "bg-gray-500/20 text-gray-400 border-gray-500/40";

  const formattedDate = new Date(item.queued_at).toLocaleString();

  return (
    <section aria-label="Item payload details">
      {/* Summary heading */}
      <h2 className="text-lg font-semibold text-gray-100">
        {item.payload.summary}
      </h2>

      {/* Metadata row */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
          {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses}`}
        >
          {item.status}
        </span>
        <span className="text-xs text-gray-400">
          Queued: {formattedDate}
        </span>
      </div>

      {/* Details as key-value pairs */}
      {Object.keys(item.payload.details).length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-gray-300">Details</h3>
          <dl className="space-y-1 rounded-md border border-charcoal-600 bg-charcoal-900 p-3">
            {Object.entries(item.payload.details).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-sm">
                <dt className="font-mono text-gray-400">{key}:</dt>
                <dd className="text-gray-200">
                  {typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
