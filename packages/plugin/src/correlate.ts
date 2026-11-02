import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { listLiveSockets, socketPathFor } from "@agent-gc/local";

function parentPid(pid: number): number | null {
  const r = spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8", timeout: 1000 });
  if (r.status !== 0) return null;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) && n > 1 ? n : null;
}

/**
 * Find the unix socket of the MCP process that belongs to the same Claude Code session as this hook.
 * The MCP process names its socket after its parent pid (the `claude` process); the hook walks its
 * own ancestors looking for that pid. Falls back to the only live socket when there is exactly one.
 */
export function findSessionSocket(startPid = process.pid, maxDepth = 8): string | null {
  let pid: number | null = startPid;
  for (let depth = 0; pid && depth < maxDepth; depth++) {
    const candidate = socketPathFor(pid);
    if (fs.existsSync(candidate)) return candidate;
    pid = parentPid(pid);
  }
  const live = listLiveSockets();
  return live.length === 1 ? live[0]!.path : null;
}
