#!/usr/bin/env bash
# Explicit lifecycle commands for one L4 job. No server, idle daemon, or deletion.
set -euo pipefail
command=${1:?usage: brev.sh create|run|copy|stop NAME [arguments]}
name=${2:?provide an instance name}
root=$(cd "$(dirname "$0")/../.." && pwd)
case "$name" in *[!a-zA-Z0-9-]*|'') echo 'invalid instance name' >&2; exit 2;; esac
case "$command" in
  create)
    printf 'Instance: %s; one stoppable L4. Check the live offers below.\n' "$name"
    brev ls
    brev search --gpu-name L4 --stoppable --sort price
    brev create "$name" --gpu-name L4 --stoppable
    ;;
  run)
    data=${3:?provide captured training directory}
    heroes=${4:?provide captured hero directory}
    stage=$(mktemp -d)
    trap 'rm -rf "$stage"' EXIT
    mkdir -p "$stage/pipelines/prithvi" "$stage/data" "$stage/heroes"
    cp "$root"/pipelines/prithvi/*.py "$root"/pipelines/prithvi/pyproject.toml "$root"/pipelines/prithvi/uv.lock "$stage/pipelines/prithvi/"
    cp "$root/pipelines/hero_fields.yaml" "$stage/pipelines/"
    cp "$data/manifest.json" "$data"/*.tif "$stage/data/"
    cp "$heroes"/*.npz "$heroes"/*.json "$stage/heroes/"
    tar -czf "$stage/job.tgz" -C "$stage" pipelines data heroes
    brev copy "$stage/job.tgz" "$name:job.tgz"
    brev exec "$name" "mkdir -p ~/itza-prithvi && tar -xzf ~/job.tgz -C ~/itza-prithvi && cd ~/itza-prithvi && uv sync --project pipelines/prithvi --locked && uv run --project pipelines/prithvi python pipelines/prithvi/train.py data output --device cuda && uv run --project pipelines/prithvi python pipelines/prithvi/hero.py infer heroes output/model.pt output/metrics.json output/publications --bundles output/bundles"
    ;;
  copy)
    destination=${3:?provide local output directory}
    brev copy "$name:itza-prithvi/output" "$destination"
    ;;
  stop)
    brev stop "$name"
    ;;
  *) echo 'expected create, run, copy or stop' >&2; exit 2;;
esac
