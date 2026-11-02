import { describe, expect, it } from "vitest";
import { bearer } from "./auth.js";
import { hashSecret, newId, newInviteCode, newToken } from "../ids.js";

describe("bearer", () => {
  it("extracts bearer tokens only", () => {
    expect(bearer("Bearer abc")).toBe("abc");
    expect(bearer("bearer abc")).toBe("abc");
    expect(bearer("Basic abc")).toBeUndefined();
    expect(bearer(undefined)).toBeUndefined();
  });
});

describe("ids", () => {
  it("prefixes ids and tokens", () => {
    expect(newId("room")).toMatch(/^room_[a-z0-9]{12}$/);
    expect(newToken("hum")).toMatch(/^hum_[A-Za-z0-9_-]{32}$/);
    expect(newInviteCode()).toMatch(/^[a-z0-9]{8}$/);
  });
  it("hashes deterministically and never stores the raw value", () => {
    const t = newToken("agt");
    expect(hashSecret(t)).toBe(hashSecret(t));
    expect(hashSecret(t)).not.toContain(t);
    expect(hashSecret(t)).toHaveLength(64);
  });
});
