import type { PipelineProgress } from "@/types/review";

type RunStatus = PipelineProgress["run_status"];

interface StatusBadgeProps {
  status: RunStatus;
}

const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  running: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  completed: "bg-green-500/20 text-green-300 border-green-500/40",
  failed: "bg-red-500/20 text-red-300 border-red-500/40",
  paused: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

const RUN_STATUS_DOT_COLORS: Record<RunStatus, string> = {
  running: "bg-blue-400",
  completed: "bg-green-400",
  failed: "bg-red-400",
  paused: "bg-amber-400",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const colorClasses = RUN_STATUS_COLORS[status];
  const dotColor = RUN_STATUS_DOT_COLORS[status];

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
