#!/usr/bin/env node
// Space Apps submission helpers (issue #102).
//
//   node scripts/submission.mjs references          regenerate submission/references.md from THIRD_PARTY_NOTICES.md
//   node scripts/submission.mjs references --check  fail when references.md is stale
//   node scripts/submission.mjs limits [video.mp4]  fail when the video is over 30.0 s or the deck over 7 slides
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NOTICES = join(ROOT, "THIRD_PARTY_NOTICES.md");
const REFERENCES = join(ROOT, "submission/references.md");
const DECK = join(ROOT, "submission/deck/slides.md");
const MAX_SECONDS = 30;
const MAX_SLIDES = 7;

export function buildReferences(notices) {
  const start = notices.indexOf("\n## 1. ");
  if (start < 0) throw new Error("THIRD_PARTY_NOTICES.md has no '## 1.' section");
  const body = notices
    .slice(start + 1)
    .replace(/^<!-- licenses:(begin|end).*-->\n?/gm, "")
    .replace(/\]\((?!https?:|#)(?:\.\/)?([^)]+)\)/g, "](https://github.com/ITZA-SPACE/itza/blob/main/$1)");
  return `# References\n\nPaste into the Space Apps "Space Agency Partner Data and Other References" field. Generated from THIRD_PARTY_NOTICES.md by \`node scripts/submission.mjs references\`; do not edit by hand.\n\nCredit ESA/Copernicus: Sentinel-2 data reach ITZA through NASA HLS S30 and the EOxCloudless 2016 basemap (contains modified Copernicus Sentinel data 2016 & 2017).\n\nITZA's own code and content: Apache License 2.0 (https://github.com/ITZA-SPACE/itza/blob/main/LICENSE).\n\n${body}`;
}

export function countSlides(md) {
  return md.split(/^---\s*$/m).filter((s) => s.trim()).length;
}

export function videoSeconds(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr || r.error}`);
  return Number.parseFloat(r.stdout);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "references") {
    const next = buildReferences(readFileSync(NOTICES, "utf8"));
    if (rest.includes("--check")) {
      if (!existsSync(REFERENCES) || readFileSync(REFERENCES, "utf8") !== next) {
        console.error("submission/references.md is stale: run `node scripts/submission.mjs references`");
        return 1;
      }
      return 0;
    }
    writeFileSync(REFERENCES, next);
    return 0;
  }
  if (cmd === "limits") {
    let failed = false;
    const slides = countSlides(readFileSync(DECK, "utf8"));
    console.log(`deck: ${slides} slides (max ${MAX_SLIDES})`);
    if (slides > MAX_SLIDES) failed = true;
    const video = rest[0];
    if (video) {
      const s = videoSeconds(video);
      console.log(`video: ${s.toFixed(1)} s (max ${MAX_SECONDS.toFixed(1)})`);
      if (!(s <= MAX_SECONDS)) failed = true;
    } else console.log("video: not checked (pass the file path)");
    return failed ? 1 : 0;
  }
  console.error("usage: submission.mjs references [--check] | limits [video.mp4]");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
