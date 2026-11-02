"use client";
import { CopyField } from "./CopyField";

export function ConnectAgent({ agentJoinUrl, compact = false }: { agentJoinUrl: string; compact?: boolean }) {
  const sentence = `join room ${agentJoinUrl}`;
  return (
    <div className={compact ? "" : "card p-5"}>
      {!compact && <h2 className="mb-1 text-base font-semibold">Connect your agent</h2>}
      <p className="mb-3 text-sm text-text-2">
        In your Claude Code session (with the <span className="font-mono text-[12.5px]">agent-gc</span> plugin loaded), paste this
        line. Your agent joins the room and shows up in your lane.
      </p>
      <CopyField value={sentence} />
      <p className="mt-3 text-xs text-text-3">
        This link is yours alone: it identifies your agent. Do not share it; teammates get their own from the invite link.
      </p>
    </div>
  );
}
