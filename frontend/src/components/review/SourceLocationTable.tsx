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
      <h3 className="mb-2 text-sm font-medium text-gray-300">
        Source Locations
      </h3>
      <div className="overflow-x-auto rounded-md border border-charcoal-600">
        <table className="w-full text-sm text-gray-200">
          <thead className="bg-charcoal-800 text-xs uppercase text-gray-400">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Page
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Section
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Clause Ref
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Offset Range
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-700">
            {locatedCitations.map((citation) => {
              const loc = citation.source_location!;
              return (
                <tr key={citation.claim_id} className="hover:bg-charcoal-800/50">
                  <td className="px-3 py-2">
                    {loc.page_number !== null ? loc.page_number : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {loc.section_id ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {loc.clause_ref ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
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
