import { useEffect, useState } from "react";

export interface ToastProps {
  /** Message to display in the toast notification */
  message: string;
  /** Whether the toast is visible */
  visible: boolean;
  /** Called when the toast auto-dismisses or is manually dismissed */
  onDismiss: () => void;
  /** Auto-dismiss duration in milliseconds (default: 4000) */
  duration?: number;
  /** Visual variant for the toast */
  variant?: "info" | "error" | "warning";
}

const VARIANT_STYLES: Record<string, string> = {
  info: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  error: "bg-red-500/20 text-red-300 border-red-500/40",
  warning: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

/**
 * A simple auto-dismissing toast notification component.
 * Used to display brief feedback messages such as "already decided" conflicts.
 */
export function Toast({
  message,
  visible,
  onDismiss,
  duration = 4000,
  variant = "info",
}: ToastProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
  }, [visible]);

  useEffect(() => {
    if (!show) return;

    const timer = setTimeout(() => {
      setShow(false);
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [show, duration, onDismiss]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded border px-4 py-3 shadow-lg ${VARIANT_STYLES[variant]}`}
    >
      <span className="text-sm">{message}</span>
      <button
        type="button"
        onClick={() => {
          setShow(false);
          onDismiss();
        }}
        aria-label="Dismiss notification"
        className="ml-2 rounded p-1 text-current opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
      >
        ✕
      </button>
    </div>
  );
}
