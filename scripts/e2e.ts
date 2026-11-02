/**
 * End-to-end protocol test: starts the built server against the compose Postgres,
 * creates a room, joins two members, connects two agents and one board client,
 * then asserts delivery, tiers, presence, acks and reconnect inbox.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import {
  parseAgentJoinUrl,
  type Delivery,
  type MemberCredentials,
  type ServerFrame,
} from "@agent-gc/protocol";
import { RoomClient } from "@agent-gc/local";

const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = process.env.DATABASE_URL ?? "postgres://agentgc:agentgc@localhost:5434/agentgc";

async function startServer(): Promise<ChildProcess> {
  const child = spawn("node", ["apps/server/dist/index.js"], {
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, PUBLIC_SERVER_URL: BASE, LOG_LEVEL: "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return child;
    } catch {
      /* not yet */
    }
    await sleep(200);
  }
  child.kill();
  throw new Error("server did not start");
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${json.error}`);
  return json;
}

function waitFor<T>(desc: string, check: () => T | undefined, ms = 5000): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const v = check();
      if (v !== undefined) return resolve(v);
      if (Date.now() - start > ms) return reject(new Error(`timeout waiting for ${desc}`));
      setTimeout(tick, 25);
    };
    tick();
  });
}

function connectAgent(url: string, name: string) {
  const { server, token } = parseAgentJoinUrl(url);
  const c = new RoomClient({ server, token, log: (m) => console.log(`  [${name}] ${m}`) });
  const deliveries: Delivery[] = [];
  const all: Delivery[] = []; // never reset; used to ack everything
  c.on("delivery", (d) => {
    deliveries.push(d);
    all.push(d);
  });
  c.on("inbox", (ds) => {
    deliveries.push(...ds);
    all.push(...ds);
  });
  c.connect();
  return { c, deliveries, all };
}

async function main() {
  const server = await startServer();
  const failures: string[] = [];
  try {
    console.log("create room + join");
    const ran = await post<MemberCredentials>("/rooms", { name: "e2e", creatorName: "ran" });
    const sam = await post<MemberCredentials>(`/rooms/${ran.room.id}/join`, { inviteCode: ran.inviteCode, name: "sam" });
    await assert.rejects(
      post(`/rooms/${ran.room.id}/join`, { inviteCode: ran.inviteCode, name: "Sam" }),
      /already in this room/,
      "duplicate name rejected",
    );
    await assert.rejects(post(`/rooms/${ran.room.id}/join`, { inviteCode: "nope00", name: "eve" }), /wrong invite/);

    console.log("connect board + 2 agents");
    const board = new RoomClient({ server: BASE, token: ran.humanToken });
    const boardFrames: ServerFrame[] = [];
    board.on("frame", (f) => boardFrames.push(f));
    board.connect();
    const A = connectAgent(ran.agentJoinUrl, "ranAgent");
    const B = connectAgent(sam.agentJoinUrl, "samAgent");
    await waitFor("snapshots", () => (A.c.self && B.c.self && board.self ? true : undefined));
    A.c.register("claude-A", "/tmp/a");
    B.c.register("claude-B", "/tmp/b");
    await waitFor("board sees 2 connected sessions", () => {
      const live = board.snapshot?.sessions.filter((s) => s.connected) ?? [];
      return live.length === 2 && live.every((s) => s.claudeSessionId) ? true : undefined;
    });

    console.log("human chat -> normal to both agents");
    await board.send("skip dark mode, not enough time");
    await waitFor("both agents got chat", () => (A.deliveries.length && B.deliveries.length ? true : undefined));
    assert.equal(A.deliveries[0]!.tier, "normal");
    assert.equal(B.deliveries[0]!.tier, "normal");
    assert.equal(A.deliveries[0]!.message.senderName, "ran");

    console.log("agent direct message -> urgent to target only");
    A.deliveries.length = 0;
    B.deliveries.length = 0;
    const id = await A.c.send("need the sessions API shape", { to: ["sam"] });
    const d = await waitFor("B delivery", () => B.deliveries.find((x) => x.message.id === id));
    assert.equal(d.tier, "urgent");
    assert.equal(d.message.senderName, "ran/agent");
    await sleep(200);
    assert.equal(A.deliveries.length, 0, "sender gets nothing back");

    console.log("@mention -> urgent");
    B.deliveries.length = 0;
    A.deliveries.length = 0;
    const id2 = await B.c.send("@ran auth is done");
    const d2 = await waitFor("A mention", () => A.deliveries.find((x) => x.message.id === id2));
    assert.equal(d2.tier, "urgent");
    assert.deepEqual(d2.message.mentions, ["ran"]);

    console.log("fyi -> board only");
    A.deliveries.length = 0;
    B.deliveries.length = 0;
    const id3 = await A.c.send("progress: editing Timer.tsx", { fyi: true });
    await waitFor("board got fyi", () => boardFrames.find((f) => f.type === "message" && f.message.id === id3));
    await sleep(200);
    assert.equal(B.deliveries.length, 0, "fyi not delivered to agents");

    console.log("unknown recipient -> error");
    await assert.rejects(A.c.send("hi", { to: ["nobody"] }), /No member named/);

    console.log("status event -> presence on board");
    const before = boardFrames.length;
    B.c.status({ state: "working", action: "editing api/sessions.ts", file: "api/sessions.ts", note: null, at: new Date().toISOString() });
    const pres = await waitFor("presence", () =>
      boardFrames.slice(before).find((f) => f.type === "presence" && f.session.status?.action === "editing api/sessions.ts"),
    );
    assert.equal(pres.type, "presence");

    console.log("unacked delivery survives reconnect; acked does not");
    B.c.ack(B.all.map((x) => x.deliveryId)); // clear everything B received so far
    B.deliveries.length = 0;
    const id4 = await A.c.send("first", { to: ["sam"] });
    const id5 = await A.c.send("second", { to: ["sam"] });
    await waitFor("B got both", () => (B.deliveries.length >= 2 ? true : undefined));
    B.c.ack([B.deliveries.find((x) => x.message.id === id4)!.deliveryId]);
    await sleep(200);
    B.c.close();
    const B2 = connectAgent(sam.agentJoinUrl, "samAgent2");
    const inbox = await waitFor("B2 inbox", () => (B2.deliveries.length ? B2.deliveries : undefined));
    assert.deepEqual(inbox.map((x) => x.message.id), [id5]);

    console.log("disconnect -> offline presence");
    await waitFor("old B offline on board", () =>
      board.snapshot?.sessions.find((s) => s.claudeSessionId === "claude-B" && !s.connected && s.status?.state === "offline")
        ? true
        : undefined,
    );

    console.log("rest: history + single message with auth");
    const page = (await (
      await fetch(`${BASE}/rooms/${ran.room.id}/messages?limit=3`, { headers: { authorization: `Bearer ${sam.humanToken}` } })
    ).json()) as { messages: unknown[]; nextBefore: string | null };
    assert.equal(page.messages.length, 3);
    assert.ok(page.nextBefore);
    const unauth = await fetch(`${BASE}/rooms/${ran.room.id}`);
    assert.equal(unauth.status, 401);

    A.c.close();
    B2.c.close();
    board.close();
  } catch (err) {
    failures.push(err instanceof Error ? err.stack ?? err.message : String(err));
  } finally {
    server.kill("SIGTERM");
  }
  if (failures.length) {
    console.error("\nE2E FAILED\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nE2E PASSED");
  process.exit(0);
}

main();
