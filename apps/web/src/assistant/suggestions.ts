import { type CopyKey, t } from "../copy";

/** Suggested questions for the screen the farmer is on. */
export function suggestionsFor(pathname: string): string[] {
  const keys: CopyKey[] = (() => {
    if (pathname.startsWith("/compare"))
      return [
        "assistant.suggest.compare",
        "assistant.suggest.compare.season",
        "assistant.suggest.compare.future",
      ];
    if (pathname.startsWith("/future")) return ["assistant.suggest.future"];
    if (pathname.startsWith("/inputs")) return ["assistant.suggest.inputs"];
    if (pathname.startsWith("/history")) return ["assistant.suggest.history"];
    if (pathname.startsWith("/twin")) return ["assistant.suggest.twin"];
    if (pathname.startsWith("/field")) return ["assistant.suggest.field"];
    return ["assistant.suggest.default"];
  })();
  return keys.map((key) => t(key));
}
