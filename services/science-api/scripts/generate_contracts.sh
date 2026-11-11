#!/usr/bin/env bash
# Generates Pydantic models from ../../schemas into src/itza_science/contracts.
# Only the shared contract schemas listed here are generated; run via `pnpm schemas:generate`.
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMAS=(common provenance canonical-series field-bundle engine-input engine-output evidence-card assistant-tools)
OUT=src/itza_science/contracts
TMP_ROOT="$(mktemp -d)"
TMP="$TMP_ROOT/schemas"
mkdir "$TMP"
trap 'rm -rf "$TMP_ROOT"' EXIT

for name in "${SCHEMAS[@]}"; do
  cp "../../schemas/${name}.schema.json" "$TMP/"
done

rm -rf "$OUT"
uv run datamodel-codegen \
  --input "$TMP" --input-file-type jsonschema --output "$OUT" \
  --output-model-type pydantic_v2.BaseModel --target-python-version 3.12 \
  --use-standard-collections --use-union-operator --field-constraints \
  --disable-timestamp --use-annotated --formatters black
