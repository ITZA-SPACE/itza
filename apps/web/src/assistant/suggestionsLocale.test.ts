import { describe, expect, it } from "vitest";
import { t } from "../copy";
import { suggestionsFor } from "./suggestions";
import { browserLocale, localizedSuggestions } from "./suggestionsLocale";

describe("browserLocale", () => {
  it("maps the browser language to the assistant's languages", () => {
    expect(browserLocale("fr-FR")).toBe("fr");
    expect(browserLocale("fr")).toBe("fr");
    expect(browserLocale("ar-DZ")).toBe("ar");
    expect(browserLocale("en-US")).toBe("en");
    expect(browserLocale("de")).toBe("en");
    expect(browserLocale(undefined)).toBe("en");
  });
});

describe("localizedSuggestions", () => {
  const paths = ["/", "/compare", "/future", "/inputs", "/history", "/twin", "/field"];

  it("keeps English for English browsers", () => {
    for (const path of paths) {
      expect(localizedSuggestions(suggestionsFor(path), "en-GB")).toEqual(suggestionsFor(path));
    }
  });

  it("translates every suggestion on every screen to French and Arabic", () => {
    for (const path of paths) {
      const english = suggestionsFor(path);
      for (const language of ["fr-FR", "ar-MA"]) {
        const local = localizedSuggestions(english, language);
        expect(local).toHaveLength(english.length);
        local.forEach((question, i) => {
          expect(question, `${path} ${language}`).not.toBe(english[i]);
          expect(question.trim().length).toBeGreaterThan(5);
        });
      }
    }
  });

  it("uses Arabic script for Arabic and accents for French", () => {
    expect(localizedSuggestions([t("assistant.suggest.default")], "ar")[0]).toMatch(/[؀-ۿ]/);
    expect(localizedSuggestions([t("assistant.suggest.compare")], "fr")[0]).toMatch(/rotation/);
  });

  it("leaves a question it does not know as it is", () => {
    expect(localizedSuggestions(["Something new?"], "fr")).toEqual(["Something new?"]);
  });
});
