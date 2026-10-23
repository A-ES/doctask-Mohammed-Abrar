import type { PipelineProgress } from "@/types/review";

type RunStatus = PipelineProgress["run_status"];

interface StatusBadgeProps {
  status: RunStatus;
}

const RUN_STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  paused: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  pending: "bg-white/10 text-white/70 border-white/20",
  cancelled: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
};

const RUN_STATUS_DOT_COLORS: Record<string, string> = {
  running: "bg-blue-400",
  completed: "bg-emerald-400",
  failed: "bg-rose-400",
  paused: "bg-amber-400",
  pending: "bg-white/40",
  cancelled: "bg-zinc-400",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const colorClasses = RUN_STATUS_COLORS[status] ?? "bg-white/10 text-white/70 border-white/20";
  const dotColor = RUN_STATUS_DOT_COLORS[status] ?? "bg-white/40";

  return (
    <span
      role="status"
      aria-label={`Run status: ${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor}${status === "running" ? " animate-pulse" : ""}`}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}

export default StatusBadge;
