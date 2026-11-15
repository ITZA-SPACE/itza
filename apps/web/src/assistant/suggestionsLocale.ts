import { type CopyKey, t } from "../copy";
import { type Locale, tl } from "./locale";

const KEYS: CopyKey[] = [
  "assistant.suggest.field",
  "assistant.suggest.history",
  "assistant.suggest.inputs",
  "assistant.suggest.compare",
  "assistant.suggest.compare.season",
  "assistant.suggest.compare.future",
  "assistant.suggest.future",
  "assistant.suggest.twin",
  "assistant.suggest.default",
];

/** The assistant's language for the browser's language: French and Arabic, English otherwise. */
export function browserLocale(language: string | undefined): Locale {
  const code = (language ?? "").toLowerCase();
  if (code.startsWith("fr")) return "fr";
  if (code.startsWith("ar")) return "ar";
  return "en";
}

/**
 * The suggested questions, written in the browser's language when the assistant has them. The
 * interface around them stays English; a question it has no translation for is shown as it is.
 */
export function localizedSuggestions(
  suggestions: readonly string[],
  language: string | undefined = typeof navigator === "undefined" ? undefined : navigator.language,
): string[] {
  const locale = browserLocale(language);
  if (locale === "en") return [...suggestions];
  const byEnglish = new Map(KEYS.map((key) => [t(key), key]));
  return suggestions.map((question) => {
    const key = byEnglish.get(question);
    return key ? tl(locale, key) : question;
  });
}
