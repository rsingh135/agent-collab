import path from "node:path";
import type { AgentStatus } from "@agent-gc/protocol";

/** Minimal shape of Claude Code hook stdin we rely on. Unknown fields are ignored. */
export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  notification_type?: string;
  message?: string;
  stop_hook_active?: boolean;
}

const now = () => new Date().toISOString();

function rel(cwd: string | undefined, file: string): string {
  if (!cwd) return file;
  const r = path.relative(cwd, file);
  return r && !r.startsWith("..") ? r : file;
}

function head(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

/** Derive a board status from a hook event, or null when the event carries no status change. */
export function statusFromHook(event: string, input: HookInput): AgentStatus | null {
  switch (event) {
    case "SessionStart":
      return { state: "idle", action: "session started", file: null, note: null, at: now() };
    case "UserPromptSubmit":
      return {
        state: "working",
        action: input.prompt ? `working on: ${head(input.prompt, 70)}` : "working",
        file: null,
        note: null,
        at: now(),
      };
    case "PostToolUse":
      return toolStatus(input);
    case "Notification":
      if (input.notification_type === "permission_prompt")
        return { state: "waiting_on_human", action: "waiting on your approval", file: null, note: null, at: now() };
      if (input.notification_type === "idle_prompt")
        return { state: "idle", action: "waiting for a prompt", file: null, note: null, at: now() };
      return null;
    case "Stop":
      return { state: "idle", action: "finished turn", file: null, note: null, at: now() };
    case "SessionEnd":
      return { state: "offline", action: null, file: null, note: null, at: now() };
    default:
      return null;
  }
}

function toolStatus(input: HookInput): AgentStatus | null {
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  const filePath = typeof ti.file_path === "string" ? ti.file_path : typeof ti.path === "string" ? ti.path : null;
  const file = filePath ? rel(input.cwd, filePath) : null;
  const base = { state: "working" as const, note: null, at: now() };
  switch (tool) {
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return { ...base, action: file ? `editing ${file}` : "editing a file", file };
    case "Read":
      return { ...base, action: file ? `reading ${file}` : "reading", file };
    case "Grep":
    case "Glob":
    case "LS":
      return { ...base, action: "searching the codebase", file: null };
    case "Bash": {
      const cmd = typeof ti.command === "string" ? ti.command : "";
      const desc = typeof ti.description === "string" ? ti.description : "";
      return { ...base, action: `running ${head(desc || cmd || "a command", 60)}`, file: null };
    }
    case "WebFetch":
    case "WebSearch":
      return { ...base, action: "looking something up", file: null };
    case "Task":
    case "Agent":
      return { ...base, action: "delegating to a subagent", file: null };
    default:
      if (tool.startsWith("mcp__")) {
        const parts = tool.split("__");
        const name = parts[parts.length - 1] ?? tool;
        if (parts[1]?.endsWith("agent-gc")) return null; // our own tools (mcp__agent-gc__* or mcp__plugin_agent-gc_agent-gc__*) are not "work"
        return { ...base, action: `using ${name}`, file: null };
      }
      return { ...base, action: tool ? `using ${tool}` : "working", file: null };
  }
}
