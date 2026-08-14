import type { SourceCitation } from "@/types/review";

interface SourceLocationTableProps {
  citations: SourceCitation[];
}

/**
 * Renders source location metadata in an accessible table.
 * Only includes citations with non-null source_location.
 */
export function SourceLocationTable({ citations }: SourceLocationTableProps) {
  const locatedCitations = citations.filter(
    (c) => c.source_location !== null
  );

  if (locatedCitations.length === 0) {
    return null;
  }

  return (
    <section aria-label="Source locations">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
        Source Locations
      </h3>
      <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm text-white/70">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/30">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Page
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Section
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Clause Ref
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Offset Range
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {locatedCitations.map((citation) => {
              const loc = citation.source_location!;
              return (
                <tr key={citation.claim_id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-3 py-2.5 text-white/60">
                    {loc.page_number !== null ? loc.page_number : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-white/60">
                    {loc.section_id ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-white/60">
                    {loc.clause_ref ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-white/50">
                    {loc.start_offset}–{loc.end_offset}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
