import { createMCPClient } from "@ai-sdk/mcp";
import { type ToolSet, tool } from "ai";
import { z } from "zod";

/**
 * Tools declared without `execute` run in the browser (engine, glossary, UI). The gateway only
 * forwards their schemas to the model (TECHNICAL_ARCHITECTURE §10.3).
 */
const rotationId = z.string().min(1).max(64);
const text = (max: number) => z.string().min(1).max(max);

export const clientTools: ToolSet = {
  get_field_summary: tool({
    description: "Area, cropping history and climate fingerprint highlights of the user's field.",
    inputSchema: z.object({}),
  }),
  compare_rotations: tool({
    description: "Ranked cards for candidate rotations. Omit ids to compare all of them.",
    inputSchema: z.object({ ids: z.array(rotationId).max(8).optional() }),
  }),
  run_backtest: tool({
    description: "Resilience profile of one rotation over the replayed seasons.",
    inputSchema: z.object({
      rotation: rotationId,
      scenario: z.enum(["history", "2050"]).optional(),
    }),
  }),
  get_season: tool({
    description: "Indicators and replay for one past season.",
    inputSchema: z.object({ year: z.number().int().min(1980).max(2100) }),
  }),
  explain_exclusion: tool({
    description: "Why a crop was excluded for this field.",
    inputSchema: z.object({ crop: text(64) }),
  }),
  set_priorities: tool({
    description: "Propose new priorities. The user must confirm before anything changes.",
    inputSchema: z.object({ priorities: z.record(z.string().max(32), z.number().min(0).max(1)) }),
  }),
  set_constraints: tool({
    description: "Propose new constraints. The user must confirm before anything changes.",
    inputSchema: z.object({ constraints: z.record(z.string().max(32), z.string().max(64)) }),
  }),
  render_answer: tool({
    description: "Show an answer as an interactive surface built only from catalog components.",
    inputSchema: z.object({
      messages: z.array(z.record(z.string(), z.unknown())).min(1).max(32),
    }),
  }),
  navigate: tool({
    description: "Open an app view such as the 2050 view, the 3D twin or zones.",
    inputSchema: z.object({
      view: z.enum(["map", "replay", "cards", "twin", "future", "zones"]),
      params: z.record(z.string().max(32), z.string().max(64)).optional(),
    }),
  }),
  define_term: tool({
    description: "Plain-language definition from the app glossary.",
    inputSchema: z.object({ term: text(64) }),
  }),
};

/** The only hosts the gateway ever calls for data. No URL comes from a request or a tool result. */
export const MCP_SERVERS = [
  { prefix: "power", source: "NASA POWER MCP", url: "https://power.larc.nasa.gov/mcp/" },
  { prefix: "cmr", source: "NASA CMR MCP", url: "https://cmr.earthdata.nasa.gov/mcp/v1" },
] as const;

export type McpServer = (typeof MCP_SERVERS)[number];

export interface McpConnection {
  tools(): Promise<ToolSet>;
  close(): Promise<void>;
}

export type McpConnect = (server: McpServer) => Promise<McpConnection>;

const MCP_TIMEOUT_MS = 8_000;

export const connectMcp: McpConnect = async (server) => {
  const client = await createMCPClient({
    transport: { type: "http", url: server.url },
    initializationOptions: { timeout: MCP_TIMEOUT_MS },
  });
  return { tools: () => client.tools() as Promise<ToolSet>, close: () => client.close() };
};

async function lastValue(result: unknown): Promise<unknown> {
  if (result && typeof result === "object" && Symbol.asyncIterator in result) {
    let last: unknown;
    for await (const value of result as AsyncIterable<unknown>) last = value;
    return last;
  }
  return result;
}

/** Wraps a server tool so every result carries provenance and is marked as untrusted data. */
function withProvenance(
  server: McpServer,
  name: string,
  original: ToolSet[string],
  now: () => number,
) {
  const execute = original.execute;
  if (!execute) return original;
  return {
    ...original,
    execute: async (input: unknown, options: Parameters<typeof execute>[1]) => ({
      untrusted_data: await lastValue(await execute(input as never, options)),
      provenance: {
        source: server.source,
        server: server.url,
        tool: name,
        retrievedAt: new Date(now()).toISOString(),
      },
    }),
  } as ToolSet[string];
}

export interface ServerTools {
  tools: ToolSet;
  close(): Promise<void>;
}

/** Connects to every NASA MCP server. A server that is down is skipped: its data becomes a gap. */
export async function loadServerTools(
  connect: McpConnect,
  now: () => number,
): Promise<ServerTools> {
  const tools: ToolSet = {};
  const open: McpConnection[] = [];
  await Promise.all(
    MCP_SERVERS.map(async (server) => {
      try {
        const connection = await connect(server);
        open.push(connection);
        for (const [name, original] of Object.entries(await connection.tools())) {
          tools[`${server.prefix}_${name}`] = withProvenance(server, name, original, now);
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: "mcp_unavailable",
            server: server.prefix,
            error: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }),
  );
  return {
    tools,
    close: async () => {
      await Promise.allSettled(open.map((connection) => connection.close()));
    },
  };
}
