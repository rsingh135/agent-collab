import { describe, expect, it } from "vitest";
import { statusFromHook } from "./status-from-hook.js";

describe("statusFromHook", () => {
  it("maps edits to relative file", () => {
    const s = statusFromHook("PostToolUse", {
      cwd: "/repo",
      tool_name: "Edit",
      tool_input: { file_path: "/repo/web/Timer.tsx" },
    });
    expect(s?.state).toBe("working");
    expect(s?.action).toBe("editing web/Timer.tsx");
    expect(s?.file).toBe("web/Timer.tsx");
  });
  it("prefers bash description", () => {
    const s = statusFromHook("PostToolUse", {
      tool_name: "Bash",
      tool_input: { command: "pnpm test", description: "Run unit tests" },
    });
    expect(s?.action).toBe("running Run unit tests");
  });
  it("ignores our own tools", () => {
    expect(statusFromHook("PostToolUse", { tool_name: "mcp__agent-gc__send_message" })).toBeNull();
    expect(statusFromHook("PostToolUse", { tool_name: "mcp__plugin_agent-gc_agent-gc__send_message" })).toBeNull();
  });
  it("maps notifications", () => {
    expect(statusFromHook("Notification", { notification_type: "permission_prompt" })?.state).toBe("waiting_on_human");
    expect(statusFromHook("Notification", { notification_type: "idle_prompt" })?.state).toBe("idle");
    expect(statusFromHook("Notification", { notification_type: "other" })).toBeNull();
  });
  it("truncates prompt", () => {
    const s = statusFromHook("UserPromptSubmit", { prompt: "x".repeat(200) });
    expect(s?.action?.length).toBeLessThanOrEqual(84);
  });
});
