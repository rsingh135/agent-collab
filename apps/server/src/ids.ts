import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newId(prefix: string): string {
  const bytes = randomBytes(12);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${s}`;
}

export function newToken(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

/** Short, human-typable invite code. */
export function newInviteCode(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
