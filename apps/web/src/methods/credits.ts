import { parse } from "yaml";
import manifestText from "../../../../data-sources.yaml?raw";
import noticesText from "../../../../THIRD_PARTY_NOTICES.md?raw";
import { type CopyKey, hasCopy, t } from "../copy";

export type CreditGroup = "nasa" | "partner" | "other";

export interface CreditRow {
  key: string;
  name: string;
  version?: string;
  role: string;
  license: string;
  citation?: string;
  doi?: string;
  url?: string;
}

export interface LibraryList {
  title: string;
  rows: { name: string; version: string; license: string }[];
}

export interface Credits {
  groups: Record<CreditGroup, CreditRow[]>;
  libraries: LibraryList[];
}

interface Source {
  id: string;
  provider: string;
  product: string;
  version?: string;
  license: string;
  citation: string;
  doi?: string;
}

const NASA_LICENSE = "NASA open data (no usage restrictions)";
const DOI = /10\.\d{4,}\/[^\s),\]]+/g;
const LINK = /\[([^\]]*)\]\(([^)]*)\)/g;

/** A cell's text without markdown emphasis and links, plus the first link target. */
function cell(raw: string): { text: string; url?: string } {
  const url = [...raw.matchAll(LINK)][0]?.[2];
  const text = raw
    .replace(LINK, "$1")
    .replace(/\*\*|`/g, "")
    .trim();
  return url ? { text, url } : { text };
}

/** Every markdown table of the notices file with the number of its `##` section and `###` title. */
function tables(text: string) {
  const out: { section: number; title: string; rows: string[][] }[] = [];
  let section = 0;
  let title = "";
  let rows: string[][] | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("|")) {
      if (!rows) {
        rows = [];
        out.push({ section, title, rows });
        continue; // the header row
      }
      if (/^\|[\s|:-]+\|?$/.test(line)) continue;
      rows.push(line.replace(/^\||\|\s*$/g, "").split("|"));
      continue;
    }
    rows = null;
    const heading = /^(##+) (.*)/.exec(line);
    if (heading?.[1] === "##") section = Number.parseInt(heading[2] ?? "", 10) || 0;
    if (heading) title = heading[2] ?? "";
  }
  return out;
}

export function buildCredits(
  manifest: string,
  notices: string,
  role: (id: string) => string,
): Credits {
  const sources = (parse(manifest) as { sources: Source[] }).sources;
  const groups: Credits["groups"] = { nasa: [], partner: [], other: [] };

  for (const s of sources) {
    const row: CreditRow = {
      key: s.id,
      name: `${s.product} (${s.provider})`,
      role: role(s.id),
      license: s.license,
      citation: s.citation,
      ...(s.version ? { version: s.version } : {}),
      ...(s.doi ? { doi: s.doi } : {}),
    };
    groups[s.license === NASA_LICENSE ? "nasa" : "other"].push(row);
    // HLS combines Landsat with ESA's Sentinel-2: the Sentinel-2 half is partner data.
    const s2 = /HLSS30 DOI: (10\.[^\s.]+(?:\.[^\s.]+)*)/.exec(s.citation);
    if (s2) {
      groups.partner.push({
        ...row,
        key: `${s.id}:sentinel-2`,
        name: `HLSS30 Sentinel-2 (ESA/Copernicus) via ${s.provider}`,
        ...(s2[1] ? { doi: s2[1] } : {}),
      });
    }
  }

  const manifestText = manifest;
  const sourceIds = sources.map((s) => s.id);
  const libraries: LibraryList[] = [];
  for (const { section, title, rows } of tables(notices)) {
    if (section === 6) {
      libraries.push({
        title,
        rows: rows.map(([n = "", v = "", l = ""]) => ({
          name: n.trim(),
          version: v.trim(),
          license: l.trim(),
        })),
      });
      continue;
    }
    for (const r of rows) {
      const c = r.map(cell);
      const name = c[0]?.text ?? "";
      let row: CreditRow;
      if (section === 1) {
        const dois = r[2]?.match(DOI) ?? [];
        const covered = dois.length
          ? dois.every((d) => manifestText.includes(d))
          : sourceIds.some((id) => name.toLowerCase().includes(id.split("_")[1] ?? id));
        if (covered) continue;
        row = {
          key: `notices:${name}`,
          name,
          role: c[1]?.text ?? "",
          license: NASA_LICENSE,
          citation: c[2]?.text ?? "",
          ...(dois[0] ? { doi: dois[0] } : {}),
          ...(c[2]?.url ? { url: c[2].url } : {}),
        };
        groups.nasa.push(row);
        continue;
      }
      row =
        section === 2
          ? {
              key: `notices:${name}`,
              name,
              role: c[1]?.text ?? "",
              license: c[2]?.text ?? "",
              citation: c[3]?.text ?? "",
              ...(c[3]?.url ? { url: c[3].url } : {}),
            }
          : section === 3
            ? { key: `notices:${name}`, name, role: c[1]?.text ?? "", license: c[2]?.text ?? "" }
            : { key: `notices:${name}`, name, role: c[2]?.text ?? "", license: c[1]?.text ?? "" };
      // GAEZ is a static knowledge-pack source, so it comes from the register, not the bundle manifest.
      if (section === 2 && name.startsWith("FAO / IIASA GAEZ v5")) {
        row.role = role("gaez_v5") || row.role;
      }
      groups[section === 2 && /Sentinel/.test(name) ? "partner" : "other"].push(row);
    }
  }
  return { groups, libraries };
}

/** The role of a manifest source in ITZA: copy key `credits.role.<id>`; a missing one fails the test. */
export function roleOf(id: string): string {
  const key = `credits.role.${id}`;
  return hasCopy(key) ? t(key as CopyKey) : "";
}

export const credits = buildCredits(manifestText, noticesText, roleOf);
