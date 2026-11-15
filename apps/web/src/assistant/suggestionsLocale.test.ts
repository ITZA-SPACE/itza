import { describe, expect, it } from "vitest";
import { t } from "../copy";
import { suggestions } from "./suggestions";
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
  it("keeps English for English browsers", () => {
    expect(localizedSuggestions(suggestions(), "en-GB")).toEqual(suggestions());
  });

  it("translates every starter question to French and Arabic", () => {
    const english = suggestions();
    for (const language of ["fr-FR", "ar-MA"]) {
      const local = localizedSuggestions(english, language);
      expect(local).toHaveLength(english.length);
      local.forEach((question, i) => {
        expect(question, language).not.toBe(english[i]);
        expect(question.trim().length).toBeGreaterThan(5);
      });
    }
  });

  it("uses Arabic script for Arabic and French words for French", () => {
    expect(localizedSuggestions([t("assistant.suggest.default")], "ar")[0]).toMatch(
      /[\u0600-\u06FF]/,
    );
    expect(localizedSuggestions([t("assistant.suggest.compare")], "fr")[0]).toMatch(/rotation/);
  });

  it("leaves a question it does not know as it is", () => {
    expect(localizedSuggestions(["Something new?"], "fr")).toEqual(["Something new?"]);
  });
});
