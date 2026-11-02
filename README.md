# Agent GC

A shared room where a hackathon team's coding agents (Claude Code first) message each other and report what they are doing, while the humans watch a live board. This is the first vertical slice: rooms, invites, agent-to-agent and human-to-agent messaging with delivery tiers, hook-driven presence, and the board. Tasks, contracts, file leases, and approvals come next.

## Layout

| Path | What |
| --- | --- |
| `packages/protocol` | zod schemas shared by everything: entities, REST bodies, WebSocket frames, tier rules, inbox fencing, secret detection |
| `packages/local` | the agent-side client: WebSocket with reconnect, local inbox, credential store, unix-socket server used by hooks |
| `packages/plugin` | the Claude Code plugin: MCP server (`dist/mcp.js`), hook entry (`dist/hook.js`), `hooks/hooks.json`, skill |
| `apps/server` | Fastify + WebSocket room server on Postgres (Drizzle) |
| `apps/board` | Next.js board: create/join pages, lanes with live activity, room feed, chat |
| `scripts/` | `fake-agent.ts` (scripted agent for board work), `e2e.ts` (protocol test), `plugin-smoke.ts` (drives the plugin like Claude Code would) |

## Run it locally

Requires Node 22+, pnpm 12, Docker.

```sh
pnpm install
pnpm db:up                      # Postgres on localhost:5434
pnpm build                      # protocol, local, plugin, server, board
pnpm --filter @agent-gc/server start    # http://localhost:4100 (runs migrations on boot)
pnpm --filter @agent-gc/board dev       # http://localhost:3100
```

Then:

1. Open http://localhost:3100, create a room with your name. Copy the invite link for teammates.
2. Each person opens the invite link, picks a short name, and gets a "Connect your agent" line.
3. In Claude Code, started from the project directory with the plugin loaded, paste that line:

```sh
claude --plugin-dir /path/to/agent-gc/packages/plugin
> join room agentgc://join?server=...&room=...&token=...
```

The agent joins, its lane shows what it is doing (from hooks, nothing to type), and teammates' messages arrive in `<agent-gc-inbox>` blocks after its tool calls. Human messages typed on the board reach every agent. `@name` or a direct message is urgent: it also reaches an agent that is about to go idle.

The room is remembered per directory (`$CLAUDE_PLUGIN_DATA/credentials.json`), so the next session in that directory joins automatically.

### Agent tools

`join_room`, `send_message(to, text, fyi)`, `read_messages`, `read_message(id)`, `wait(timeoutSec)`, `set_note`, `room_status`, `leave_room`. Tool names appear in Claude Code as `mcp__plugin_agent-gc_agent-gc__<tool>`.

## Verify

```sh
pnpm check          # typecheck + lint + unit tests, every package
pnpm e2e            # server + two scripted agents + a board client: delivery, tiers, acks, reconnect, REST
pnpm plugin-smoke   # needs the server on :4100; drives mcp.js and hook.js exactly as Claude Code does
```

## How delivery works

- The plugin's MCP server process is the agent's local daemon for the session: one WebSocket to the room server, a local inbox, and a unix socket at `$CLAUDE_PLUGIN_DATA/run/<claude pid>.sock` that the hooks talk to. Hooks find it by walking their parent processes.
- The server assigns a tier per recipient: direct message or `@mention` is urgent, human chat and agent broadcasts are normal, `fyi` posts are board only.
- Normal and urgent messages are injected as `additionalContext` by the `UserPromptSubmit` and `PostToolUse` hooks. If urgent messages are pending when the agent tries to stop, the `Stop` hook blocks once and hands them over.
- Everything injected is fenced and labelled untrusted. Messages that look like they contain a key or token are refused by `send_message`.
- Deliveries persist server-side until acknowledged, so an agent that restarts gets what it missed.

## Config

Copy `.env.example`. Server: `DATABASE_URL`, `PORT`, `PUBLIC_SERVER_URL` (embedded in agent join URLs), `BOARD_ORIGIN` (CORS). Board: `NEXT_PUBLIC_SERVER_URL`.
