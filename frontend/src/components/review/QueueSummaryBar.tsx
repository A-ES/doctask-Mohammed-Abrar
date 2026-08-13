export interface QueueSummaryBarProps {
  total: number;
  pending: number;
}

export function QueueSummaryBar({ total, pending }: QueueSummaryBarProps) {
  return (
    <div
      className="flex items-center gap-2 rounded bg-charcoal-900 px-3 py-1.5 text-xs text-gray-400"
      aria-live="polite"
    >
      <span>Total: {total}</span>
      <span aria-hidden="true">|</span>
      <span>Pending: {pending}</span>
    </div>
  );
}
