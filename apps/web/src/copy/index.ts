import strings from "./en.json";

export type CopyKey = keyof typeof strings;

/** Look up English UI copy. All user-facing text lives in en.json. */
export function t(key: CopyKey): string {
  return strings[key];
}
