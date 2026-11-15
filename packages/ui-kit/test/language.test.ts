import { describe, expect, it } from "vitest";
import {
  checkGrounding,
  detectLanguage,
  languageInstruction,
  matchesLanguage,
  normalizeDigits,
} from "../catalog";

describe("detectLanguage", () => {
  const cases: [string, string, "latin" | "arabic", boolean][] = [
    ["Which rotation held up best?", "en", "latin", false],
    ["What is the average rainfall in 2018?", "en", "latin", false],
    ["Show me ET0 and NDVI for SSP2-4.5", "en", "latin", false],
    ["Quelle rotation a le mieux résisté ?", "fr", "latin", false],
    ["Pourquoi la saison 2017-18 est la plus difficile pour mon champ", "fr", "latin", false],
    ["Comment va ma culture cette année", "fr", "latin", false],
    ["شنو هي أحسن روطاسيون لحقلي؟", "ar", "arabic", true],
    ["كيفاش كانت الأمطار هاد العام", "ar", "arabic", true],
    ["ما هي أفضل دورة زراعية لحقلي؟", "ar", "arabic", false],
    ["chhal kant l3am l9ssi f had l7a9l?", "ar", "latin", true],
    ["wach l9ma7 mzyan f hadi l ard", "ar", "latin", true],
    ["kifach nchouf l7a9l dyali", "ar", "latin", true],
    ["3lach l3am hada sa3b", "ar", "latin", true],
    ["", "en", "latin", false],
    ["12345 !!!", "en", "latin", false],
  ];
  for (const [text, lang, script, darija] of cases) {
    it(`${JSON.stringify(text)} is ${lang}/${script}${darija ? "/darija" : ""}`, () => {
      expect(detectLanguage(text)).toMatchObject({ lang, script, darija });
    });
  }

  it("knows the common Darija greetings and fillers", () => {
    for (const text of [
      "salam, labas?",
      "labas 3lik",
      "hamdullah, kolchi mezyan",
      "chwiya dyal l7a9l",
      "mrhba bik",
      "slm khoya, kidayr?",
      "لاباس عليك",
      "شوية ديال الشتا",
    ]) {
      const language = detectLanguage(text);
      expect(language, text).toMatchObject({ lang: "ar", darija: true, sure: true });
    }
  });

  it("is unsure, and does not force English, when nothing points to a language", () => {
    for (const text of ["", "ok", "12345", "salam", "hmm", "😀"]) {
      expect(detectLanguage(text).sure, JSON.stringify(text)).toBe(false);
    }
    expect(languageInstruction(detectLanguage("ok"))).toMatch(/same language and script/);
    expect(languageInstruction(detectLanguage("hello there"))).toMatch(/Write everything in English/);
  });

  it("does not mistake identifiers with digits for arabizi", () => {
    expect(detectLanguage("ET0 rot2 SSP2 NDVI2 v3").lang).toBe("en");
  });

  it("needs two weak words before treating plain Latin text as Darija", () => {
    expect(detectLanguage("fin de saison pour mon champ").lang).toBe("fr");
    expect(detectLanguage("ila bghiti nta").lang).toBe("ar");
  });

  it("describes the reply language for the prompt", () => {
    expect(languageInstruction(detectLanguage("hello there"))).toMatch(/English/);
    expect(languageInstruction(detectLanguage("quelle pluie pour mon champ"))).toMatch(/French/);
    expect(languageInstruction(detectLanguage("شنو هي الأمطار"))).toMatch(/Darija.*Arabic script/);
    expect(languageInstruction(detectLanguage("ما هي الأمطار في الحقل"))).toMatch(
      /Modern Standard Arabic/,
    );
    expect(languageInstruction(detectLanguage("chhal tmatret"))).toMatch(/Latin letters/);
  });
});

describe("number grounding across languages", () => {
  const output = { mean_score: 0.58, seasons: 17, area_ha: 1234.5 };

  it("reads Arabic-Indic digits, decimal marks and percent signs", () => {
    expect(normalizeDigits("٠٫٥٨")).toBe("0.58");
    expect(normalizeDigits("٥٨٪")).toBe("58%");
    expect(normalizeDigits("۱۷ موسما")).toBe("17 موسما");
  });

  it("accepts a supported number in every digit style", () => {
    for (const text of [
      "score 0.58",
      "score 0,58",
      "score ٠٫٥٨",
      "score 58 %",
      "score ٥٨٪",
      "17 saisons",
      "١٧ موسما",
    ]) {
      expect(checkGrounding([text], [output]).ok, text).toBe(true);
    }
  });

  it("reads French and Arabic thousands separators", () => {
    expect(normalizeDigits("1 234")).toBe("1234");
    expect(normalizeDigits("1 234")).toBe("1234");
    expect(normalizeDigits("1 234,5")).toBe("1234.5");
    expect(checkGrounding(["1 234,5 ha"], [output]).ok).toBe(true);
    expect(checkGrounding(["1,234.5 ha"], [output]).ok).toBe(true);
  });

  it("still rejects an invented number in every digit style", () => {
    for (const text of [
      "score 0.91",
      "score 0,91",
      "score ٠٫٩١",
      "score 91 %",
      "score ٩١٪",
      "٩١ موسما",
    ]) {
      expect(checkGrounding([text], [output]).ok, text).toBe(false);
    }
  });

  it("does not merge two separate numbers written with spaces", () => {
    expect(normalizeDigits("2018 2019")).toBe("2018 2019");
    expect(normalizeDigits("rotation 2 and 17")).toBe("rotation 2 and 17");
  });
});

describe("one language per reply", () => {
  it("names the language and forbids mixing in the instruction", () => {
    const french = languageInstruction(detectLanguage("Quelle rotation est la meilleure ?"));
    expect(french).toMatch(/Write everything in French/);
    expect(french).toMatch(/chip labels and the chip questions/);
    expect(french).toMatch(/Never mix languages/);
    expect(languageInstruction(detectLanguage("which rotation is best?"))).toMatch(/in English/);
    expect(languageInstruction(detectLanguage("شنو هي أحسن روطاسيون؟"))).toMatch(/Arabic script/);
    expect(languageInstruction(detectLanguage("chhal tmatret"))).toMatch(/Latin letters/);
  });

  it("accepts text in the user's language and rejects a sure text in another", () => {
    const french = detectLanguage("Quelle rotation a le mieux résisté ?");
    expect(matchesLanguage(french, "La rotation A est la meilleure pour votre champ.")).toBe(true);
    expect(matchesLanguage(french, "Rotation A is the best choice for your field.")).toBe(false);
    expect(matchesLanguage(french, "شنو هي أحسن روطاسيون لحقلي")).toBe(false);
    const english = detectLanguage("Which rotation held up best?");
    expect(matchesLanguage(english, "Rotation A held up best in most seasons.")).toBe(true);
    expect(matchesLanguage(english, "La rotation A est la meilleure pour votre champ.")).toBe(
      false,
    );
  });

  it("lets ambiguous, short or number-only text through", () => {
    const french = detectLanguage("Quelle rotation est la meilleure ?");
    for (const text of ["", "2018", "NDVI", "ok", "A / B"]) {
      expect(matchesLanguage(french, text), text).toBe(true);
    }
    expect(matchesLanguage(detectLanguage("ok"), "Anything at all, in any language.")).toBe(true);
  });

  it("treats a different script for Darija as a mismatch", () => {
    const latin = detectLanguage("chhal kant l3am l9ssi f had l7a9l?");
    expect(matchesLanguage(latin, "شنو هي أحسن روطاسيون لحقلي")).toBe(false);
  });
});
