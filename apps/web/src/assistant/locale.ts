import type { Language } from "@itza/ui-kit/catalog";
import { type CopyKey, t } from "../copy";
import ar from "../copy/assistant-locales/ar.json";
import fr from "../copy/assistant-locales/fr.json";

/**
 * The languages the assistant's own fallback text (predefined answers, offline templates) exists in.
 * The rest of the app stays English. Arabic covers Darija in either script: the text is in Arabic
 * script, which Darija speakers read whichever way they typed the question.
 */
export type Locale = "en" | "fr" | "ar";

const STRINGS: Record<Exclude<Locale, "en">, Record<string, string>> = { fr, ar };

export const localeOf = (language: Language): Locale =>
  language.lang === "fr" ? "fr" : language.lang === "ar" ? "ar" : "en";

/** The copy for `key` in `locale`; English when that language has no text for it. */
export function tl(locale: Locale, key: CopyKey): string {
  if (locale === "en") return t(key);
  return STRINGS[locale][key] ?? t(key);
}
