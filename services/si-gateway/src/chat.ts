import { detectLanguage } from "@itza/ui-kit/catalog";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { type Ledger, LIMITS } from "./budget";
import type { Env } from "./env";
import { buildSystemPrompt } from "./policy";
import { type ModelV4, selectProviders, withFallback } from "./providers";
import {
  collectTurnOutputs,
  countFailedRenders,
  createRenderAnswerTool,
  renderSettled,
} from "./render";
import { needsNasaData } from "./route";
import { clientTools, loadServerTools, type McpConnect } from "./tools";

export interface ChatDeps {
  ledger: Ledger;
  now: () => number;
  /** Fallback-wrapped model for this request, or null when no provider key is configured. */
  model: (env: Env) => ModelV4 | null;
  connectMcp: McpConnect;
}

export function defaultModel(env: Env): ModelV4 | null {
  const providers = selectProviders(env);
  return providers.length ? withFallback(providers) : null;
}

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Only user and assistant roles: a client can never inject its own system prompt.
const bodySchema = z.object({
  messages: z
    .array(
      z.looseObject({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.looseObject({ type: z.string() })).max(64),
      }),
    )
    .min(1)
    .max(LIMITS.maxMessages),
});

/** Text of the user's most recent message: the language of the reply follows it. */
export function lastUserText(
  messages: readonly { role: string; parts: readonly unknown[] }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return message.parts
      .map((part) => {
        const p = part as { type?: string; text?: unknown };
        return p.type === "text" && typeof p.text === "string" ? p.text : "";
      })
      .join(" ");
  }
  return "";
}

type Json = (body: unknown, status: number, extra?: Record<string, string>) => Response;

async function readBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function handleChat(
  request: Request,
  env: Env,
  deps: ChatDeps,
  json: Json,
  cors: Record<string, string>,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const verdict = deps.ledger.checkIp(ip);
  if (!verdict.ok) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(verdict.retryAfterSeconds),
    });
  }

  const sessionId = request.headers.get("X-Session-Id") ?? "";
  if (!SESSION_ID.test(sessionId)) return json({ error: "invalid_session" }, 400);

  const body = await readBody(request);
  if (!body.ok)
    return json({ error: body.status === 413 ? "payload_too_large" : "invalid_json" }, body.status);
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  const model = deps.model(env);
  if (!model) return json({ error: "no_provider", fallback: "templates" }, 503);

  // Grounding uses this turn's tool outputs: browser tools arrive in the messages, server tools
  // append here as they run.
  const turn = parsed.data.messages as unknown as { role: string; parts: never[] }[];
  const turnOutputs = collectTurnOutputs(turn);
  const renderTool = createRenderAnswerTool(turnOutputs, countFailedRenders(turn));
  const knownTools = { ...clientTools, render_answer: renderTool };

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(parsed.data.messages as Omit<UIMessage, "id">[], {
      tools: knownTools,
    });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (!deps.ledger.admitSession(sessionId)) {
    return json({ error: "budget_exhausted", fallback: "templates" }, 429);
  }

  // The NASA data servers cost seconds and prompt tokens: connect them only when the question asks
  // for weather or catalogue data, and not again once the tools have already returned this turn.
  const userText = lastUserText(turn);
  const server =
    turnOutputs.length === 0 && needsNasaData(userText)
      ? await loadServerTools(deps.connectMcp, deps.now, (output) => turnOutputs.push(output))
      : { tools: {}, close: async () => {} };
  const allTools = { ...knownTools, ...server.tools };
  const toolNames = Object.keys(allTools) as (keyof typeof allTools)[];
  const result = streamText({
    model,
    system: buildSystemPrompt({
      serverTools: Object.keys(server.tools),
      language: detectLanguage(userText),
    }),
    messages: modelMessages,
    tools: allTools,
    // Step by step: before any tool has returned, the model may call a data tool or reply in plain
    // text (render_answer is not offered, so a greeting cannot print a tool call as text). Once
    // results exist, the only thing left is the answer, and it must be a render_answer call.
    prepareStep: () =>
      turnOutputs.length > 0
        ? {
            activeTools: ["render_answer"],
            toolChoice: { type: "tool", toolName: "render_answer" },
          }
        : { activeTools: toolNames.filter((name) => name !== "render_answer") },
    abortSignal: request.signal,
    maxOutputTokens: LIMITS.maxOutputTokens,
    stopWhen: [stepCountIs(LIMITS.maxSteps), renderSettled],
    onEnd: async (event) => {
      deps.ledger.addTokens(sessionId, event.totalUsage.totalTokens ?? 0);
      await server.close();
    },
    onAbort: () => server.close(),
    onError: () => server.close(),
  });

  // Never forward provider error text: it can echo request details.
  return result.toUIMessageStreamResponse({ headers: cors, onError: () => "provider_error" });
}
