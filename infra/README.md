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

The VPS stack is the manual fallback; it builds the image locally (`docker compose up -d --build`).

## Google Cloud Run (continuous delivery)

Every push to `main` runs `.github/workflows/release.yml`, which builds the images, pushes them to Artifact Registry and deploys two Cloud Run services in `europe-west1`: `itza-science-api` (port 8000) and `itza-web` (nginx, port 8080).

| Item | Value |
|---|---|
| GCP project | the shared project id in the repo variable `GCP_PROJECT_ID` |
| Image repo | Artifact Registry `itza` |
| Runtime identity | `itza-run@<project>` (add `secretAccessor` per secret when secrets are wired) |
| Deploy identity | `itza-deployer@<project>`: `run.admin` limited by IAM condition to services named `itza-*`, `artifactregistry.writer` on the `itza` repo, `serviceAccountUser` on `itza-run` |
| Auth from GitHub | Workload Identity Federation, pool `github-itza`, restricted to `ITZA-SPACE/itza`; no key files |
| Repo variables | `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `GCP_RUNTIME_SA`, `WEB_ORIGIN` (CORS origin), `SI_GATEWAY_URL` (web build-time) |

Pending: `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` are not wired yet. Create them in Secret Manager, grant `itza-run` access, and add a `secrets:` block to the API deploy step. `SI_GATEWAY_URL` is a placeholder until the Cloudflare Worker is deployed.
