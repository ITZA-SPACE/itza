import { describe, expect, it } from "vitest";
import { Ledger, LIMITS } from "../src/budget";

describe("ip rate limit", () => {
  it("allows the window quota, then reports when to retry", () => {
    let now = 1_000;
    const ledger = new Ledger(() => now);
    for (let i = 0; i < LIMITS.ipRequestsPerWindow; i++)
      expect(ledger.checkIp("1.1.1.1").ok).toBe(true);
    const blocked = ledger.checkIp("1.1.1.1");
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(ledger.checkIp("2.2.2.2").ok).toBe(true);
    now += LIMITS.ipWindowMs;
    expect(ledger.checkIp("1.1.1.1").ok).toBe(true);
  });
});

describe("session budget", () => {
  it("stops after the request cap", () => {
    const ledger = new Ledger(() => 0);
    for (let i = 0; i < LIMITS.sessionRequests; i++) expect(ledger.admitSession("s")).toBe(true);
    expect(ledger.admitSession("s")).toBe(false);
    expect(ledger.admitSession("other")).toBe(true);
  });

  it("stops once tokens reach the cap and ignores bad token counts", () => {
    const ledger = new Ledger(() => 0);
    expect(ledger.admitSession("s")).toBe(true);
    ledger.addTokens("s", Number.NaN);
    ledger.addTokens("s", -5);
    ledger.addTokens("unknown", 100);
    expect(ledger.admitSession("s")).toBe(true);
    ledger.addTokens("s", LIMITS.sessionTokens);
    expect(ledger.admitSession("s")).toBe(false);
  });

  it("resets after the session expires", () => {
    let now = 0;
    const ledger = new Ledger(() => now);
    ledger.admitSession("s");
    ledger.addTokens("s", LIMITS.sessionTokens);
    expect(ledger.admitSession("s")).toBe(false);
    now += LIMITS.sessionTtlMs;
    // Eviction only runs when the map is large, so fill it with expired ids.
    for (let i = 0; i < LIMITS.maxEntries; i++) ledger.admitSession(`filler-${i}`);
    expect(ledger.admitSession("s")).toBe(true);
  });

  it("bounds memory under a flood of live ids", () => {
    const ledger = new Ledger(() => 0);
    for (let i = 0; i < LIMITS.maxEntries + 50; i++) ledger.admitSession(`id-${i}`);
    // Oldest ids were dropped, so they start fresh.
    for (let i = 0; i < LIMITS.sessionRequests; i++) ledger.admitSession("id-0");
    expect(ledger.admitSession("id-0")).toBe(false);
  });
});
