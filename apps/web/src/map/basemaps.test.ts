import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGERY_ATTRIBUTION, IMAGERY_TILES } from "./basemaps";

const src = resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|json)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("satellite imagery source", () => {
  it("uses the EOxCloudless 2016 layer, which EOX licenses under CC BY 4.0", () => {
    expect(IMAGERY_TILES).toBe(
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    );
  });

  it("names the source, EOX and the license in the attribution", () => {
    expect(IMAGERY_ATTRIBUTION).toContain("EOxCloudless");
    expect(IMAGERY_ATTRIBUTION).toContain("EOX IT Services GmbH");
    expect(IMAGERY_ATTRIBUTION).toContain("Contains modified Copernicus Sentinel data 2016");
    expect(IMAGERY_ATTRIBUTION).toContain("CC BY 4.0");
  });

  it("never requests a non-commercial EOX year (2018 to 2025) from anywhere in the app", () => {
    const offenders = sourceFiles(src).filter((file) =>
      /s2cloudless-(2018|2019|202\d)/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
