import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "@itza/knowledge";
import type { FieldBundle } from "../../src/contracts";
import { type Crop, isCrop } from "../../src/physics";

const synthetic = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/synthetic");

export function loadBundle(name: "semi-arid-winter-cereal" | "fallow-heavy"): FieldBundle {
  return JSON.parse(readFileSync(join(synthetic, `${name}.bundle.json`), "utf8")) as FieldBundle;
}

export function packCrop(packId: string, cropId: string): Crop {
  const entry = loadPack(packId).crops.find((c) => c.id === cropId);
  if (!entry || !isCrop(entry)) throw new Error(`No crop ${cropId} in ${packId}`);
  return entry;
}
