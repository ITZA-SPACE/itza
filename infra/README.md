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
| Repo variables | `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `GCP_RUNTIME_SA`, `WEB_ORIGIN` (CORS origin), `GCP_DATASET_BUCKET` (dataset store bucket, see below), `SI_GATEWAY_URL` (web build-time) |

The science API deploy step keeps the whole runtime configuration, so a rebuilt service reproduces the live one from the workflow alone: the second-generation environment, the read-only `dataset-store` volume (bucket from `GCP_DATASET_BUCKET`) mounted at `/data/store`, `ITZA_DATASET_STORE_DIR=/data/store`, and the Secret Manager secrets `EARTHDATA_TOKEN` (`earthdata-token`) and `OPENET_API_KEY` (`openet-api-key`), each readable by `itza-run`. Create a secret once with `gcloud secrets create <name> --data-file=-` and grant `itza-run` `roles/secretmanager.secretAccessor`; add a version to rotate it. If a deploy fails with a Secret Manager permission error for `itza-deployer`, grant that account `roles/secretmanager.viewer`. `SI_GATEWAY_URL` is a placeholder until the Cloudflare Worker is deployed.

## Dataset store (GCS)

A shared, versioned, read-only-for-the-team store for the large NASA inputs (issue #103). Sync tool, manifest and usage: [`pipelines/data_store/`](../pipelines/data_store/README.md). Created once by a GCP project admin, not by CI, and only after the team approves the size table in the issue.

```bash
# Replace PROJECT and GROUP; run as a project admin.
gcloud storage buckets create gs://PROJECT-itza-data \
  --project=PROJECT --location=europe-west1 --default-storage-class=STANDARD \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://PROJECT-itza-data --versioning
cat > lifecycle.json <<'JSON'
{"rule": [{"action": {"type": "Delete"}, "condition": {"daysSinceNoncurrentTime": 30, "isLive": false}}]}
JSON
gcloud storage buckets update gs://PROJECT-itza-data --lifecycle-file=lifecycle.json
# Team reads through a Google group; one pipeline account and one maintainer write.
gcloud storage buckets add-iam-policy-binding gs://PROJECT-itza-data \
  --member=group:GROUP --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding gs://PROJECT-itza-data \
  --member=serviceAccount:itza-data@PROJECT.iam.gserviceaccount.com --role=roles/storage.objectAdmin
```

| Item | Choice |
|---|---|
| Location, class | `europe-west1`, Standard, uniform bucket-level access |
| Public access | prevented; no public objects (the app serves its own static bundles) |
| Versioning | on; noncurrent versions deleted after 30 days |
| Layout | `raw/<source>/<version>/`, `derived/<pipeline>/<version>/`, `manifests/` |
| Readers | the team Google group, `roles/storage.objectViewer` |
| Writers | the `itza-data` service account and one data maintainer, `roles/storage.objectAdmin` on this bucket only (use workload identity, no key files) |
| Secrets | none in the repo or manifest; Earthdata from `~/.netrc` or Secret Manager |

Costs (approximate; check the [GCS pricing page](https://cloud.google.com/storage/pricing) before approving, prices change):

- Storage: Standard in `europe-west1` is about USD 0.02 per GB per month, so the 50 GB target is about USD 1 per month. Noncurrent versions count for 30 days.
- Operations: a few thousand class A/B operations per sync, well under one cent.
- Egress: pulling from outside Google Cloud is billed per GB (about USD 0.12 per GB at the first internet tier), so a full 50 GB pull costs a teammate's project about USD 6. Pull only the sets you need, and pull once per machine.

The science API service mounts the bucket read-only at `/data/store` (Cloud Run volume of type `cloud-storage`, second-generation environment; `itza-run` has `roles/storage.objectViewer` on the bucket). The release workflow sets this up on every deploy, from the repo variable `GCP_DATASET_BUCKET`. The mount is a live view, so sets pushed later appear without a redeploy. Layout under the mount follows the bucket, e.g. `/data/store/derived/gpm-imerg/v07-clips/<region>/<granule>.nc4`. The API reads them when `ITZA_DATASET_STORE_DIR` points at the mount. To apply the same configuration by hand:

```bash
gcloud run services update itza-science-api --region=europe-west1 --execution-environment=gen2 \
  --clear-volumes --clear-volume-mounts --update-env-vars=ITZA_DATASET_STORE_DIR=/data/store \
  --add-volume=name=dataset-store,type=cloud-storage,bucket=<bucket>,readonly=true \
  --add-volume-mount=volume=dataset-store,mount-path=/data/store
```
