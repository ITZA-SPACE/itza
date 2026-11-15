import { type ToolSet, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import type { McpConnect } from "../src/tools";

export const usage = (total: number) => ({
  inputTokens: { total, noCache: total, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
});

type StreamPart = Record<string, unknown>;

function streamOf(parts: StreamPart[]) {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    }),
  } as never;
}

export function textTurn(text: string, tokens = 10): StreamPart[] {
  return [
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usage(tokens) },
  ];
}

export function toolCallTurn(toolName: string, input: unknown, tokens = 10): StreamPart[] {
  return [
    { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage: usage(tokens),
    },
  ];
}

export function mockModel(provider: string, turns: StreamPart[][]) {
  return new MockLanguageModelV4({
    provider,
    modelId: `${provider}-model`,
    doStream: turns.map(streamOf),
  });
}

export function failingModel(provider: string, error: Error) {
  return new MockLanguageModelV4({
    provider,
    modelId: `${provider}-model`,
    doStream: async () => {
      throw error;
    },
    doGenerate: async () => {
      throw error;
    },
  });
}

/** MCP connector that serves one fake tool per server instead of calling the network. */
export function fakeMcp(options: { down?: string[] } = {}): McpConnect {
  return async (server) => {
    if (options.down?.includes(server.prefix)) throw new Error(`${server.prefix} offline`);
    const tools: ToolSet = {
      get_point_statistics: tool({
        description: "Fake climate statistic.",
        inputSchema: z.object({}),
        execute: async () => ({ t2m_mean_c: 21.4 }),
      }),
    };
    return { tools: async () => tools, close: async () => {} };
  };
}

export const env = {
  ALLOWED_ORIGINS: "http://allowed.test",
  GEMINI_API_KEY: "gemini-secret-key-123",
  GROQ_API_KEY: "groq-secret-key-456",
};

let counter = 0;
export function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  counter += 1;
  return new Request("https://si.itza.test/chat", {
    method: "POST",
    headers: {
      Origin: "http://allowed.test",
      "Content-Type": "application/json",
      "X-Session-Id": "session-abcdef",
      "CF-Connecting-IP": `10.0.0.${counter % 250}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const question = {
  messages: [
    {
      role: "user",
      parts: [{ type: "text", text: "How did last year's drought and low rainfall affect maize?" }],
    },
  ],
};
