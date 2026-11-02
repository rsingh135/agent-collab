import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { members } from "../db/schema.js";
import { hashSecret } from "../ids.js";
import { unauthorized } from "./errors.js";

export type Principal = {
  kind: "human" | "agent";
  member: typeof members.$inferSelect;
};

export async function authenticate(db: Db, token: string | undefined): Promise<Principal> {
  if (!token) throw unauthorized();
  const hash = hashSecret(token);
  if (token.startsWith("hum_")) {
    const [m] = await db.select().from(members).where(eq(members.humanTokenHash, hash)).limit(1);
    if (!m) throw unauthorized();
    return { kind: "human", member: m };
  }
  if (token.startsWith("agt_")) {
    const [m] = await db.select().from(members).where(eq(members.agentTokenHash, hash)).limit(1);
    if (!m) throw unauthorized();
    return { kind: "agent", member: m };
  }
  throw unauthorized();
}

export function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? value : undefined;
}
