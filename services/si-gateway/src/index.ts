import { Ledger } from "./budget";
import { type ChatDeps, defaultModel, handleChat } from "./chat";
import { corsHeaders, parseAllowedOrigins } from "./cors";
import type { Env } from "./env";
import { connectMcp } from "./tools";

const SERVICE = "si-gateway";

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

/** Builds the Worker handler. Tests inject a model, MCP connector and clock. */
export function createGateway(overrides: Partial<ChatDeps> = {}): {
  fetch(request: Request, env: Env): Promise<Response>;
} {
  const now = overrides.now ?? Date.now;
  const deps: ChatDeps = {
    ledger: overrides.ledger ?? new Ledger(now),
    now,
    model: overrides.model ?? defaultModel,
    connectMcp: overrides.connectMcp ?? connectMcp,
  };

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const origin = request.headers.get("Origin");
      const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
      const cors = corsHeaders(origin, allowed);
      const reply = (body: unknown, status: number, extra: Record<string, string> = {}) =>
        json(body, status, { ...cors, ...extra });

      // Browsers only send Origin cross-site; reject cross-site callers that are not allow-listed.
      if (origin && !allowed.has(origin)) {
        return json({ error: "origin_not_allowed" }, 403);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const { pathname } = new URL(request.url);
      if (pathname === "/health") {
        if (request.method !== "GET") return reply({ error: "method_not_allowed" }, 405);
        return reply({ status: "ok", service: SERVICE }, 200);
      }
      if (pathname === "/chat") {
        // /chat spends provider quota, so it requires an allow-listed browser origin.
        if (!origin) return json({ error: "origin_required" }, 403);
        return handleChat(request, env, deps, reply, cors);
      }
      return reply({ error: "not_found" }, 404);
    },
  };
}

export default createGateway();
