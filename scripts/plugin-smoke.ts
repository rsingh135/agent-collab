/**
 * Exercises the plugin exactly as Claude Code would, minus Claude:
 *  - spawns dist/mcp.js over stdio and drives it with an MCP client
 *  - runs dist/hook.js as a sibling child (same parent pid => same unix socket)
 *  - a fake teammate agent sends messages; asserts they come back fenced via the hook
 * Requires the server running on $SERVER (default http://127.0.0.1:4100).
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parseAgentJoinUrl, type MemberCredentials } from "@agent-gc/protocol";
import { RoomClient } from "@agent-gc/local";

const SERVER = process.env.SERVER ?? "http://127.0.0.1:4100";
const PLUGIN = path.resolve("packages/plugin");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "agent-gc-smoke-"));
const CWD = fs.mkdtempSync(path.join(os.tmpdir(), "agent-gc-proj-"));

async function post<T>(p: string, body: unknown): Promise<T> {
  const r = await fetch(SERVER + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

function runHook(event: string, input: Record<string, unknown>): Promise<{ stdout: string; ms: number; code: number | null }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn("node", [path.join(PLUGIN, "dist/hook.js"), event], {
      env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("close", (code) => resolve({ stdout, ms: performance.now() - t0, code }));
    child.stdin.end(JSON.stringify({ session_id: "sess-smoke", cwd: CWD, hook_event_name: event, ...input }));
  });
}

function textOf(res: unknown): string {
  const r = res as { content: Array<{ type: string; text?: string }> };
  return r.content.map((c) => c.text ?? "").join("\n");
}

async function main() {
  const ran = await post<MemberCredentials>("/rooms", { name: "smoke", creatorName: "ran" });
  const sam = await post<MemberCredentials>(`/rooms/${ran.room.id}/join`, { inviteCode: ran.inviteCode, name: "sam" });

  console.log("start MCP server process (child of this process, like Claude Code would)");
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(PLUGIN, "dist/mcp.js")],
    env: { ...(process.env as Record<string, string>), CLAUDE_PLUGIN_DATA: DATA, CLAUDE_PROJECT_DIR: CWD },
    stderr: "inherit",
  });
  const mcp = new Client({ name: "smoke", version: "0" });
  await mcp.connect(transport);
  const tools = (await mcp.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["join_room", "leave_room", "read_message", "read_messages", "room_status", "send_message", "set_note", "wait"]);

  console.log("hook before join: silent, fast");
  const pre = await runHook("PostToolUse", { tool_name: "Read", tool_input: { file_path: `${CWD}/a.ts` } });
  assert.equal(pre.stdout, "");
  console.log(`  hook wall time ${pre.ms.toFixed(0)}ms`);

  console.log("join_room");
  const joined = textOf(await mcp.callTool({ name: "join_room", arguments: { url: ran.agentJoinUrl } }));
  assert.match(joined, /Joined room "smoke" as ran\/agent/);

  console.log("SessionStart hook registers session and announces room");
  const ss = await runHook("SessionStart", {});
  assert.match(JSON.parse(ss.stdout).hookSpecificOutput.additionalContext, /connected to room "smoke" as ran\/agent/);

  console.log("teammate sends direct message -> PostToolUse hook injects it fenced");
  const { server, token } = parseAgentJoinUrl(sam.agentJoinUrl);
  const teammate = new RoomClient({ server, token });
  teammate.connect();
  await new Promise<void>((r) => teammate.once("snapshot", () => r()));
  await teammate.send("what's the Session type?", { to: ["ran"] });
  await sleep(300);
  const post1 = await runHook("PostToolUse", { tool_name: "Edit", tool_input: { file_path: `${CWD}/web/Timer.tsx` } });
  const parsed = JSON.parse(post1.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<agent-gc-inbox count="1">/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /from="sam\/agent" tier="urgent"/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /what's the Session type\?/);
  console.log(`  hook wall time ${post1.ms.toFixed(0)}ms`);

  console.log("second hook: nothing pending -> no output");
  const post2 = await runHook("PostToolUse", { tool_name: "Bash", tool_input: { command: "pnpm test" } });
  assert.equal(post2.stdout, "");

  console.log("status reached the server (board sees editing + running)");
  const board = new RoomClient({ server: SERVER, token: ran.humanToken });
  board.connect();
  await new Promise<void>((r) => board.once("snapshot", () => r()));
  const mine = board.snapshot!.sessions.find((s) => s.claudeSessionId === "sess-smoke");
  assert.ok(mine, "session registered with claude session id");
  assert.equal(mine.cwd, CWD);
  assert.equal(mine.status?.action, "running pnpm test");

  console.log("send_message refuses secrets, delivers otherwise");
  const refused = textOf(await mcp.callTool({ name: "send_message", arguments: { text: "key AKIAABCDEFGHIJKLMNOP", to: ["sam"] } }));
  assert.match(refused, /Refused/);
  const got: string[] = [];
  teammate.on("delivery", (d) => got.push(`${d.tier}:${d.message.text}`));
  const sent = textOf(await mcp.callTool({ name: "send_message", arguments: { text: "Session = {id, userId, startedAt}", to: ["sam"] } }));
  assert.match(sent, /^Sent/);
  await sleep(300);
  assert.deepEqual(got, ["urgent:Session = {id, userId, startedAt}"]);

  console.log("Stop hook blocks when urgent pending, passes otherwise");
  await teammate.send("@ran blocked on your API", {});
  await sleep(300);
  const stop1 = await runHook("Stop", { stop_hook_active: false });
  const stopParsed = JSON.parse(stop1.stdout) as { decision: string; reason: string };
  assert.equal(stopParsed.decision, "block");
  assert.match(stopParsed.reason, /blocked on your API/);
  const stop2 = await runHook("Stop", { stop_hook_active: true });
  assert.equal(stop2.stdout, "");

  console.log("wait() returns when a message arrives");
  const waiting = mcp.callTool({ name: "wait", arguments: { timeoutSec: 10 } });
  await sleep(200);
  await teammate.send("ping", { to: ["ran"] });
  const waited = textOf(await waiting);
  assert.match(waited, /ping/);

  console.log("room_status lists both members");
  const rs = textOf(await mcp.callTool({ name: "room_status", arguments: {} }));
  assert.match(rs, /ran \(you\): online/);
  assert.match(rs, /sam: online/);

  console.log("SessionEnd -> offline");
  await runHook("SessionEnd", {});
  await sleep(300);
  const after = board.snapshot!.sessions.find((s) => s.claudeSessionId === "sess-smoke");
  assert.equal(after?.status?.state, "offline");

  teammate.close();
  board.close();
  await mcp.close();
  console.log("\nPLUGIN SMOKE PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPLUGIN SMOKE FAILED\n", err);
  process.exit(1);
});
