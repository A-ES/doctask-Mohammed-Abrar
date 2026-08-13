import type { RunSummary } from "@/types/review";
import { RunSelector } from "./RunSelector";
import { StatusBadge } from "./StatusBadge";
import { ResumeButton } from "./ResumeButton";

interface TopBarProps {
  runs: RunSummary[];
  selectedRunId: string | null;
  runStatus: "running" | "completed" | "failed" | "paused";
  onSelectRun: (runId: string) => void;
  /** Whether the run can be resumed (paused or failed) */
  canResume?: boolean;
  /** Whether a resume request is in-flight */
  isResuming?: boolean;
  /** Callback to trigger run resume */
  onResume?: () => void;
}

export function TopBar({
  runs,
  selectedRunId,
  runStatus,
  onSelectRun,
  canResume = false,
  isResuming = false,
  onResume,
}: TopBarProps) {
  return (
    <header className="flex items-center gap-4 border-b border-charcoal-700 bg-charcoal-900 px-4 py-3">
      <RunSelector
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={onSelectRun}
      />
      <StatusBadge status={runStatus} />
      {onResume && (
        <ResumeButton
          canResume={canResume}
          isResuming={isResuming}
          onResume={onResume}
        />
      )}
    </header>
  );
}

export default TopBar;
