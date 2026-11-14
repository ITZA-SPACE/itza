import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import manifestText from "../../../../data-sources.yaml?raw";
import noticesText from "../../../../THIRD_PARTY_NOTICES.md?raw";
import { credits } from "./credits";

const all = Object.values(credits.groups).flat();
const sources = (parse(manifestText) as { sources: { id: string }[] }).sources;

describe("data and credits", () => {
  it("lists every data-sources.yaml entry with a role, license and citation", () => {
    for (const { id } of sources) {
      const row = all.find((r) => r.key === id);
      expect(row, id).toBeDefined();
      expect(row?.role, `${id} needs copy key credits.role.${id}`).not.toBe("");
      expect(row?.license, id).not.toBe("");
      expect(row?.citation, id).toBeTruthy();
    }
  });

  it("lists every row of every table in THIRD_PARTY_NOTICES.md with a license", () => {
    // NASA rows without a DOI that are shown from their data-sources.yaml entry instead.
    const shownFromManifest: Record<string, string> = {
      "NASA POWER Daily and Climatology API (LaRC)": "nasa_power_daily",
      "NASA CMR Search API": "cmr",
    };
    const libraries = new Set(credits.libraries.flatMap((l) => l.rows.map((r) => r.name)));
    const shown = (doi: string) => all.some((r) => r.doi === doi || r.citation?.includes(doi));
    let section = 0;
    let header = false;
    let checked = 0;
    for (const line of noticesText.split("\n")) {
      const heading = /^## (\d+)\./.exec(line);
      if (heading) section = Number(heading[1]);
      if (!line.startsWith("|")) {
        header = false;
        continue;
      }
      if (!header || /^\|[\s|:-]+\|?$/.test(line)) {
        header = true;
        continue;
      }
      const cells = line.split("|").slice(1, -1);
      const name = (cells[0] ?? "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|`/g, "")
        .trim();
      checked++;
      if (section === 6) {
        expect(libraries.has(name), `library ${name}`).toBe(true);
        continue;
      }
      const row = all.find((r) => r.key === `notices:${name}`);
      if (row) {
        expect(row.license, name).not.toBe("");
        continue;
      }
      // A NASA row may be shown from data-sources.yaml instead: every DOI it lists must be shown.
      expect(section, `${name} is missing`).toBe(1);
      const dois = cells[2]?.match(/10\.\d{4,}\/[^\s),\]]+/g) ?? [];
      if (dois.length) for (const doi of dois) expect(shown(doi), `${name}: ${doi}`).toBe(true);
      else
        expect(
          all.some((r) => r.key === shownFromManifest[name]),
          name,
        ).toBe(true);
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("groups NASA, partner and other sources separately", () => {
    expect(credits.groups.nasa.some((r) => r.key === "smap_l4")).toBe(true);
    expect(credits.groups.nasa.some((r) => r.key === "soilgrids")).toBe(false);
    expect(credits.groups.other.some((r) => r.key === "soilgrids")).toBe(true);
    const partner = credits.groups.partner.map((r) => r.key);
    expect(partner).toContain("hls_vi:sentinel-2");
    expect(credits.groups.partner.find((r) => r.key === "hls_vi:sentinel-2")?.doi).toBe(
      "10.5067/HLS/HLSS30.002",
    );
  });
});
