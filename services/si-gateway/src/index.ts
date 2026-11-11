import { corsHeaders, parseAllowedOrigins } from "./cors";
import type { Env } from "./env";

const SERVICE = "si-gateway";

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowed);

    // Browsers only send Origin cross-site; reject cross-site callers that are not allow-listed.
    if (origin && !allowed.has(origin)) {
      return json({ error: "origin_not_allowed" }, 403, {});
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
      return json({ status: "ok", service: SERVICE }, 200, cors);
    }
    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
