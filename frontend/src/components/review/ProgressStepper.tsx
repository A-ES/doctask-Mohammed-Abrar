import { deriveStageStatus, type StageStatus } from "@/utils/stageDerivation";
import { STAGES, type StageDefinition } from "@/utils/constants";

export interface ProgressStepperProps {
  completedNodes: string[];
  currentNode: string | null;
}

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "complete":
      return (
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 border border-green-500/40 text-green-300"
          aria-hidden="true"
        >
          ✓
        </span>
      );
    case "in-progress":
      return (
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/40"
          aria-hidden="true"
        >
          <span className="block h-4 w-4 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
        </span>
      );
    case "pending":
      return (
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500/20 border border-gray-500/40"
          aria-hidden="true"
        >
          <span className="block h-3 w-3 rounded-full bg-gray-500" />
        </span>
      );
  }
}

function StageLabel({ name, status }: { name: string; status: StageStatus }) {
  const statusLabel =
    status === "complete"
      ? "Complete"
      : status === "in-progress"
        ? "In progress"
        : "Pending";

  const textColor =
    status === "complete"
      ? "text-green-300"
      : status === "in-progress"
        ? "text-amber-300"
        : "text-gray-500";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-sm font-medium ${textColor}`}>{name}</span>
      <span className={`text-xs ${textColor}`}>{statusLabel}</span>
    </div>
  );
}

function Connector({ status }: { status: "complete" | "pending" }) {
  return (
    <div
      className={`hidden md:block flex-1 h-0.5 mx-2 ${
        status === "complete" ? "bg-green-500/40" : "bg-gray-500/30"
      }`}
      aria-hidden="true"
    />
  );
}

export function ProgressStepper({
  completedNodes,
  currentNode,
}: ProgressStepperProps) {
  const stageStatuses: { stage: StageDefinition; status: StageStatus }[] =
    STAGES.map((stage) => ({
      stage,
      status: deriveStageStatus(stage, completedNodes, currentNode),
    }));

  return (
    <ol
      role="list"
      aria-label="Pipeline progress"
      className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 py-4"
    >
      {stageStatuses.map(({ stage, status }, index) => (
        <li
          key={stage.name}
          role="listitem"
          aria-label={`Stage: ${stage.name} - ${status === "in-progress" ? "In progress" : status === "complete" ? "Complete" : "Pending"}`}
          className="flex items-center"
        >
          <div className="flex flex-col items-center gap-2">
            <StageIcon status={status} />
            <StageLabel name={stage.name} status={status} />
          </div>
          {index < stageStatuses.length - 1 && (
            <Connector
              status={status === "complete" ? "complete" : "pending"}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
