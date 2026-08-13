import * as Select from "@radix-ui/react-select";
import type { RunSummary } from "@/types/review";

interface RunSelectorProps {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

const STATUS_DOT_COLORS: Record<RunSummary["status"], string> = {
  running: "bg-blue-400",
  completed: "bg-green-400",
  failed: "bg-red-400",
  paused: "bg-amber-400",
};

function formatRunId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunSelector({ runs, selectedRunId, onSelectRun }: RunSelectorProps) {
  return (
    <Select.Root value={selectedRunId ?? undefined} onValueChange={onSelectRun}>
      <Select.Trigger
        aria-label="Select pipeline run"
        className="inline-flex items-center gap-2 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
      >
        <Select.Value placeholder="Select a run" />
        <Select.Icon className="text-gray-400">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="overflow-hidden rounded-md border border-gray-600 bg-gray-800 shadow-lg"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            {runs.map((run) => (
              <Select.Item
                key={run.id}
                value={run.id}
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-gray-200 outline-none data-[highlighted]:bg-gray-700 data-[highlighted]:text-white"
              >
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[run.status]}`}
                  aria-hidden="true"
                />
                <Select.ItemText>
                  {formatRunId(run.id)}
                </Select.ItemText>
                <span className="ml-auto text-xs text-gray-400">
                  {formatTimestamp(run.started_at)}
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default RunSelector;
