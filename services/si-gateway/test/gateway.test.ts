import { describe, expect, it } from "vitest";
import { corsHeaders, parseAllowedOrigins } from "../src/cors";
import worker from "../src/index";

const env = { ALLOWED_ORIGINS: "http://allowed.test, https://app.itza.test" };

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://si.itza.test${path}`, init), env);
}

describe("cors helpers", () => {
  it("parses a comma-separated origin list and drops blanks", () => {
    expect([...parseAllowedOrigins(" a.test ,, b.test ")]).toEqual(["a.test", "b.test"]);
  });

  it("returns no headers for unknown or missing origins", () => {
    const allowed = new Set(["http://allowed.test"]);
    expect(corsHeaders(null, allowed)).toEqual({});
    expect(corsHeaders("http://evil.test", allowed)).toEqual({});
  });
});

describe("gateway worker", () => {
  it("reports health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "si-gateway" });
  });

  it("adds CORS headers for allow-listed origins", async () => {
    const res = await call("/health", { headers: { Origin: "http://allowed.test" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://allowed.test");
  });

  it("rejects origins that are not allow-listed", async () => {
    const res = await call("/health", { headers: { Origin: "http://evil.test" } });
    expect(res.status).toBe(403);
  });

  it("answers CORS preflight", async () => {
    const res = await call("/health", {
      method: "OPTIONS",
      headers: { Origin: "https://app.itza.test" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("rejects wrong methods and unknown routes", async () => {
    expect((await call("/health", { method: "POST" })).status).toBe(405);
    expect((await call("/nope")).status).toBe(404);
  });
});
