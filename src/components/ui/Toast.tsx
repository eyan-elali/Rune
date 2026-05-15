"use client";

import { useEffect, useState } from "react";
import { useToastStore, type Toast } from "@/store/toastStore";

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useToastStore((s) => s.dismissToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10);
    const hide = setTimeout(() => setVisible(false), 2200);
    const remove = setTimeout(() => dismissToast(toast.id), 2550);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [toast.id, dismissToast]);

  return (
    <div
      className="px-5 py-2.5 rounded-lg text-sm font-rune-sans"
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border-strong)",
        color: "var(--color-parchment)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        letterSpacing: "0.04em",
      }}
      role="status"
    >
      {toast.message}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-8 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
