import { describe, expect, it, vi } from "vitest";

const close = vi.fn(async () => {});
const createMCPClient = vi.fn(async (_config: unknown) => ({
  tools: async () => ({ ping: {} }),
  close,
}));
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient }));

describe("connectMcp", () => {
  it("opens an http transport to the fixed server URL with a startup timeout", async () => {
    const { MCP_SERVERS, connectMcp } = await import("../src/tools");
    const server = MCP_SERVERS[0];
    const connection = await connectMcp(server);
    expect(createMCPClient).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: { type: "http", url: server.url, fetch: expect.any(Function) },
      }),
    );
    expect(await connection.tools()).toEqual({ ping: {} });
    await connection.close();
    expect(close).toHaveBeenCalled();
  });

  it("never asks fetch to reject redirects, which Workers cannot do, and never follows them", async () => {
    const { noRedirectFetch } = await import("../src/tools");
    const fetchSpy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
    await noRedirectFetch("https://example.test/mcp", { method: "POST", redirect: "error" });
    vi.unstubAllGlobals();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.test/mcp",
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
  });
});
