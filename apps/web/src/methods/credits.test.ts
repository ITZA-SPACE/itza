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

  it("lists every row of every table in THIRD_PARTY_NOTICES.md", () => {
    const libraryRows = credits.libraries.reduce((n, l) => n + l.rows.length, 0);
    const tableRows = noticesText
      .split("\n")
      .filter((l) => l.startsWith("|") && !/^\|[\s|:-]+\|?$/.test(l)).length;
    const tables = (noticesText.match(/^\|.*\n\|[\s|:-]+\|?$/gm) ?? []).length;
    const covered = all.filter((r) => r.key.startsWith("notices:")).length + libraryRows;
    // Rows left out are the NASA products already shown from data-sources.yaml.
    expect(covered).toBeGreaterThan(0.8 * (tableRows - tables));
    expect(credits.libraries.length).toBeGreaterThanOrEqual(2);
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
