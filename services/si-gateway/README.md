# ITZA SI gateway

Cloudflare Worker between the browser and language-model APIs. It keeps API keys off the client, proxies the LLM, hosts the MCP client for NASA POWER MCP and CMR MCP, validates generated A2UI surfaces against the app catalog and enforces rate limits. See [TECHNICAL_ARCHITECTURE.md §10 and §14](../../docs/TECHNICAL_ARCHITECTURE.md#10-si-assistant).

Current routes: `GET /health`. Every response enforces the origin allow-list (`ALLOWED_ORIGINS`).

| Task | Command |
|---|---|
| Dev server (port 8790) | `pnpm dev` |
| Tests + coverage (≥ 90%) | `pnpm test` |
| Type check | `pnpm typecheck` |
| Bundle check (no deploy) | `pnpm build` |
| Deploy | `pnpm deploy` (needs `wrangler login` or `CLOUDFLARE_API_TOKEN`) |

Secrets: copy `.dev.vars.example` to `.dev.vars` for local runs; use `wrangler secret put` in production.
