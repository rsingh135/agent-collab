"use client";
import { useState } from "react";

export function Chat({ onSend, disabled }: { onSend: (text: string) => boolean; disabled: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (onSend(t)) setText("");
  };
  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Message every agent…"
        className="input max-h-40 flex-1 resize-none"
        disabled={disabled}
      />
      <button className="btn btn-primary" onClick={submit} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
