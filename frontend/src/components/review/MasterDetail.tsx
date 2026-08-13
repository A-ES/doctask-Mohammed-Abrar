import type { ReactNode } from "react";

export interface MasterDetailProps {
  listPanel: ReactNode;
  detailPanel: ReactNode;
  hasSelection: boolean;
  onBack?: () => void;
}

/**
 * Responsive master-detail layout.
 * - Desktop (md: ≥768px): side-by-side split — list 40%, detail 60%.
 * - Mobile (<768px): stacked single-column with navigation state.
 *   Shows list when hasSelection is false, detail with back button when true.
 */
export function MasterDetail({
  listPanel,
  detailPanel,
  hasSelection,
  onBack,
}: MasterDetailProps) {
  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      {/* List panel — always visible on desktop, hidden on mobile when detail is shown */}
      <div
        className={`h-full md:block md:w-2/5 md:border-r md:border-gray-700 ${
          hasSelection ? "hidden" : "block"
        }`}
      >
        {listPanel}
      </div>

      {/* Detail panel — always visible on desktop, hidden on mobile when list is shown */}
      <div
        className={`h-full md:block md:w-3/5 ${
          hasSelection ? "block" : "hidden"
        }`}
      >
        {/* Back button — only shown on mobile when detail is visible */}
        {hasSelection && (
          <div className="border-b border-gray-700 p-2 md:hidden">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to queue list"
              className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span aria-hidden="true">←</span>
              <span>Back</span>
            </button>
          </div>
        )}
        {detailPanel}
      </div>
    </div>
  );
}
