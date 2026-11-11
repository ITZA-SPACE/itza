import { type ToolSet, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { clientTools, loadServerTools, MCP_SERVERS } from "../src/tools";
import { fakeMcp } from "./helpers";

const now = () => Date.UTC(2026, 10, 11);

describe("client tools", () => {
  it("are declared without execute so the browser runs them", () => {
    for (const t of Object.values(clientTools)) expect(t.execute).toBeUndefined();
    expect(Object.keys(clientTools)).toContain("render_answer");
  });
});

describe("server tools", () => {
  it("prefixes names and attaches provenance to every result", async () => {
    const { tools } = await loadServerTools(fakeMcp(), now);
    expect(Object.keys(tools).sort()).toEqual([
      "cmr_get_point_statistics",
      "power_get_point_statistics",
    ]);
    const out = (await tools.power_get_point_statistics?.execute?.({}, {} as never)) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({
      untrusted_data: { t2m_mean_c: 21.4 },
      provenance: {
        source: "NASA POWER MCP",
        server: MCP_SERVERS[0].url,
        tool: "get_point_statistics",
        retrievedAt: "2026-11-11T00:00:00.000Z",
      },
    });
  });

  it("skips a server that is down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { tools } = await loadServerTools(fakeMcp({ down: ["cmr"] }), now);
    expect(Object.keys(tools)).toEqual(["power_get_point_statistics"]);
    expect(warn.mock.calls.flat().join(" ")).toContain("mcp_unavailable");
    warn.mockRestore();
  });

  it("keeps the last value of streaming tools and passes through tools without execute", async () => {
    const streaming: ToolSet = {
      stream: tool({
        inputSchema: z.object({}),
        async *execute() {
          yield 1;
          yield 2;
        },
      }),
      passive: tool({ inputSchema: z.object({}) }),
    };
    const { tools, close } = await loadServerTools(
      async () => ({ tools: async () => streaming, close: async () => {} }),
      now,
    );
    const out = (await tools.power_stream?.execute?.({}, {} as never)) as {
      untrusted_data: unknown;
    };
    expect(out.untrusted_data).toBe(2);
    expect(tools.power_passive?.execute).toBeUndefined();
    await close();
  });

  it("closes every connection", async () => {
    const closed: string[] = [];
    const { close } = await loadServerTools(
      async (server) => ({
        tools: async () => ({}),
        close: async () => void closed.push(server.prefix),
      }),
      now,
    );
    await close();
    expect(closed.sort()).toEqual(["cmr", "power"]);
  });
});
