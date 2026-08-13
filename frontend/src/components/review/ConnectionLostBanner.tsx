import React from "react";

export interface ConnectionLostBannerProps {
  connectionLost: boolean;
  onDismiss?: () => void;
}

/**
 * Displays a dismissible warning banner when the polling service
 * loses connectivity to the backend. Uses ARIA role="alert" for
 * immediate screen reader announcement.
 *
 * Validates: Requirements 11.3, 9.3
 */
export const ConnectionLostBanner: React.FC<ConnectionLostBannerProps> = ({
  connectionLost,
  onDismiss,
}) => {
  if (!connectionLost) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/20 px-4 py-3 text-amber-300"
    >
      <div className="flex items-center gap-2">
        <svg
          aria-hidden="true"
          className="h-5 w-5 flex-shrink-0 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <span className="text-sm font-medium">
          Connection lost. Data may be stale. Retrying...
        </span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss connection warning"
          className="rounded p-1 text-amber-300 hover:bg-amber-500/30 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ConnectionLostBanner;
