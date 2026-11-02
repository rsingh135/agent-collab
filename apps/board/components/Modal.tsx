"use client";
import { useEffect } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn px-2 py-1 text-xs" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
