import React, { useState, useEffect, useCallback } from "react";

let toastId = 0;

/**
 * Toast notification context and provider.
 * Usage:
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 * Then in any component:
 *   const { showToast } = useToast();
 *   showToast("Success!", "success");
 */

const ToastContext = React.createContext(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fallback if used outside provider
    return {
      showToast: (msg, type) => console.log(`[Toast ${type}] ${msg}`),
    };
  }
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 3500) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, leaving: false }]);

    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type} ${toast.leaving ? "toast-leaving" : ""}`}
            onClick={() => dismissToast(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === "success" && "✓"}
              {toast.type === "error" && "✕"}
              {toast.type === "info" && "ℹ"}
              {toast.type === "warning" && "⚠"}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
