import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { type Ledger, LIMITS } from "./budget";
import type { Env } from "./env";
import { buildSystemPrompt } from "./policy";
import { type ModelV4, selectProviders, withFallback } from "./providers";
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

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(parsed.data.messages as Omit<UIMessage, "id">[], {
      tools: clientTools,
    });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  if (!deps.ledger.admitSession(sessionId)) {
    return json({ error: "budget_exhausted", fallback: "templates" }, 429);
  }

  const server = await loadServerTools(deps.connectMcp, deps.now);
  const result = streamText({
    model,
    system: buildSystemPrompt({ serverTools: Object.keys(server.tools) }),
    messages: modelMessages,
    tools: { ...clientTools, ...server.tools },
    abortSignal: request.signal,
    maxOutputTokens: LIMITS.maxOutputTokens,
    stopWhen: stepCountIs(LIMITS.maxSteps),
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
