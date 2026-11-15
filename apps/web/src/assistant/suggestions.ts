import { type CopyKey, t } from "../copy";

const KEYS: CopyKey[] = [
  "assistant.suggest.compare",
  "assistant.suggest.compare.season",
  "assistant.suggest.history",
  "assistant.suggest.compare.future",
  "assistant.suggest.field",
];

/** Starter questions on the Ask ITZA page, one per part of the app. */
export function suggestions(): string[] {
  return KEYS.map((key) => t(key));
}
