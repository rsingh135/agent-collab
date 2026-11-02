"use client";
import { useState } from "react";

export function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: user can select the text */
    }
  };
  return (
    <div>
      {label && <div className="mb-1 text-xs font-medium text-text-2">{label}</div>}
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`input flex-1 text-sm ${mono ? "font-mono text-[12.5px]" : ""}`}
        />
        <button type="button" onClick={copy} className="btn shrink-0" aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
