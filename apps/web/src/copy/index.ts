import crossCheckCopy from "./en.json";
import type { CopyKey as FeatureCopyKey } from "./generated/keys";

export type CopyKey = FeatureCopyKey | keyof typeof crossCheckCopy;

// Existing feature copy lives in ./en/. New cross-check copy uses ./en.json as required
// by AGENTS.md; both sources participate in the typed lookup and duplicate-key check.
const files = import.meta.glob<Record<string, string>>("./en/*.json", {
  eager: true,
  import: "default",
});

const strings: Record<string, string> = { ...crossCheckCopy };
for (const [path, entries] of Object.entries(files)) {
  for (const [key, text] of Object.entries(entries)) {
    if (key in strings) throw new Error(`Copy key "${key}" is defined twice (${path})`);
    strings[key] = text;
  }
}

/** Look up English UI copy. English UI copy is loaded from en.json and the existing en/*.json feature files. */
export function t(key: CopyKey): string {
  return strings[key] as string;
}

/** Whether a copy key exists, for keys built from data (such as a source id). */
export function hasCopy(key: string): key is CopyKey {
  return key in strings;
}
