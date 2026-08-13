import { getCitationLabel, isUnverifiable } from "@/utils/citationHelpers";
import type { SourceCitation } from "@/types/review";

interface CitationChipProps {
  citation: SourceCitation;
}

/**
 * Renders a small inline chip indicating whether a citation is grounded
 * or unverifiable. Uses muted gray for unverifiable citations and standard
 * text color for grounded ones.
 */
export function CitationChip({ citation }: CitationChipProps) {
  const unverifiable = isUnverifiable(citation);
  const label = getCitationLabel(citation);

  const baseClasses =
    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium";

  const colorClasses = unverifiable
    ? "bg-gray-500/20 text-gray-400 border-gray-500/40"
    : "border-slate-600 text-slate-200";

  return (
    <span
      className={`${baseClasses} ${colorClasses}`}
      aria-label={
        unverifiable
          ? "Citation unverifiable"
          : `Citation grounded: ${label}`
      }
    >
      {label}
    </span>
  );
}
