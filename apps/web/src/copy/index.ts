import type { CopyKey } from "./generated/keys";

export type { CopyKey };

// One JSON file per feature in ./en/. Adding a feature's copy means adding a file there: no shared
// list to edit. The key type is generated from the same files (scripts/copyKeys.mjs).
const files = import.meta.glob<Record<string, string>>("./en/*.json", {
  eager: true,
  import: "default",
});

const strings: Record<string, string> = {};
for (const [path, entries] of Object.entries(files)) {
  for (const [key, text] of Object.entries(entries)) {
    if (key in strings) throw new Error(`Copy key "${key}" is defined twice (${path})`);
    strings[key] = text;
  }
}

/** Look up English UI copy. All user-facing text lives in src/copy/en/*.json. */
export function t(key: CopyKey): string {
  return strings[key] as string;
}

/** Whether a copy key exists, for keys built from data (such as a source id). */
export function hasCopy(key: string): key is CopyKey {
  return key in strings;
}
