# Infrastructure

Deployment layout from [TECHNICAL_ARCHITECTURE.md §4.4](../docs/TECHNICAL_ARCHITECTURE.md#44-hosting-and-compute):

| Piece | Where | How |
|---|---|---|
| Web app (`apps/web`) | Cloudflare Workers Static Assets | `vite build` output; Cloudflare deploy step added with the first release |
| SI gateway (`services/si-gateway`) | Cloudflare Worker | `pnpm --filter @itza/si-gateway deploy` |
| Data & Science API (`services/science-api`) | Team VPS, Docker Compose | `docker-compose.yml` in this folder |
| Tunnel | Team VPS | `cloudflared` service (profile `tunnel`); no inbound ports open |
| Batch jobs | NVIDIA Brev | Job scripts go in `infra/brev/`; outputs copied to VPS or repo, then instance stopped |

## VPS

```bash
cp infra/.env.example infra/.env        # fill in values
docker compose -f infra/docker-compose.yml --profile tunnel up -d
```

The `release` workflow publishes `ghcr.io/itza-space/itza/science-api` on every push to `main`. On the VPS, `docker compose pull && docker compose up -d` deploys the new image.
