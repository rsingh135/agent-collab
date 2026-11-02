/**
 * A scripted agent that speaks the room protocol. Used for board development and e2e.
 *
 *   pnpm fake-agent <agentgc://join?...> [--name label] [--chatty]
 *
 * It registers a session, cycles through realistic status events, acks what it receives,
 * and (with --chatty) posts a message every few seconds.
 */
import { parseAgentJoinUrl, type AgentStatus } from "@agent-gc/protocol";
import { Inbox, RoomClient } from "@agent-gc/local";

const url = process.argv[2];
if (!url) {
  console.error("usage: fake-agent <agentgc://join?...> [--chatty]");
  process.exit(1);
}
const chatty = process.argv.includes("--chatty");
const { server, token } = parseAgentJoinUrl(url);
const client = new RoomClient({ server, token, log: (m) => console.log(`[ws] ${m}`) });
const inbox = new Inbox();

const script: Array<Partial<AgentStatus> & { state: AgentStatus["state"] }> = [
  { state: "working", action: "reading src/App.tsx", file: "src/App.tsx" },
  { state: "working", action: "editing web/Timer.tsx", file: "web/Timer.tsx" },
  { state: "working", action: "running pnpm test" },
  { state: "waiting_on_human", action: "waiting on your approval" },
  { state: "working", action: "editing api/sessions.ts", file: "api/sessions.ts" },
  { state: "idle", action: null },
];

client.on("snapshot", (snap, self) => {
  console.log(`joined room "${snap.room.name}" as member ${self.memberId} session ${self.sessionId}`);
  client.register(`fake-${process.pid}`, process.cwd());
});
client.on("delivery", (d) => {
  inbox.add(d);
  console.log(`[${d.tier}] ${d.message.senderName}: ${d.message.text}`);
  client.ack([d.deliveryId]);
});
client.on("inbox", (ds) => {
  for (const d of ds) console.log(`[inbox ${d.tier}] ${d.message.senderName}: ${d.message.text}`);
  client.ack(ds.map((d) => d.deliveryId));
});
client.connect();

let i = 0;
setInterval(() => {
  const step = script[i++ % script.length]!;
  client.status({ state: step.state, action: step.action ?? null, file: step.file ?? null, note: null, at: new Date().toISOString() });
  if (chatty && i % 3 === 0) void client.send(`progress: ${step.action ?? "idle"}`, { fyi: true }).catch(() => {});
}, 4000);
