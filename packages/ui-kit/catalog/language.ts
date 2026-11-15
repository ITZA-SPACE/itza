/**
 * Which language the user wrote in, so the assistant can answer in it (English, French, or Darija
 * in Arabic script or in Latin letters). Pure, table-driven and cheap: it runs in the browser and in
 * the SI gateway on every question. It is a hint for the prompt, never a security decision.
 */
export type Lang = "en" | "fr" | "ar";

export interface Language {
  lang: Lang;
  script: "latin" | "arabic";
  /** True for Moroccan/Algerian dialect (Arabic script or Latin letters), false for plain Arabic. */
  darija: boolean;
  /**
   * False when nothing in the text points to a language (a short greeting, a number): the prompt
   * then tells the model to mirror the user instead of forcing English.
   */
  sure: boolean;
}

const ENGLISH: Language = { lang: "en", script: "latin", darija: false, sure: true };
const UNSURE: Language = { ...ENGLISH, sure: false };

const ARABIC_LETTER = /[؀-ۿݐ-ݿ]/g;
const LATIN_LETTER = /[A-Za-zÀ-ſ]/g;
const WORD = /[\p{L}\p{N}]+/gu;

/** Darija written with Latin letters. Only words that are not French or English words. */
const LATIN_DARIJA = new Set([
  "chhal",
  "shhal",
  "kifach",
  "kifash",
  "kifah",
  "wach",
  "wash",
  "hadi",
  "hada",
  "hadak",
  "hadchi",
  "3lach",
  "3lash",
  "bghit",
  "bghina",
  "bzaf",
  "mzyan",
  "mzian",
  "machi",
  "mchi",
  "dyal",
  "diyal",
  "dial",
  "ghadi",
  "rani",
  "kayn",
  "kayna",
  "makaynch",
  "zwin",
  "daba",
  "walo",
  "ntaya",
  "nta",
  "ntiya",
  "mnin",
  "fin",
  "wakha",
  "safi",
  "hna",
  "temma",
  "dik",
  "dak",
  "bghiti",
  "kanzra3",
  "nzra3",
  "tzra3",
  "zra3",
  "l7a9l",
  "7a9l",
  "l3am",
  "3am",
  "mtar",
  "tmatar",
  "sba7",
  "lyoum",
  "ghda",
  "bach",
  "ila",
  "walakin",
  "chno",
  "shno",
  "shnou",
  "chnou",
  "aji",
  "yallah",
  "bsa7",
  "labas",
  "lbas",
  "labass",
  "lahbas",
  "hamdullah",
  "hamdulillah",
  "hamdoulah",
  "hmdl",
  "marhba",
  "mrhba",
  "mrehba",
  "bslama",
  "bslamo",
  "chwiya",
  "chouia",
  "chwia",
  "kolchi",
  "kolshi",
  "3afak",
  "achno",
  "shkoun",
  "chkoun",
  "fhamt",
  "fhemt",
  "khoya",
  "khouya",
  "sahbi",
  "tbarkallah",
  "kidayr",
  "kidayra",
  "kidair",
  "kifdayr",
  "wakkha",
  "salam",
  "slm",
  "saha",
  "sa7a",
  "afak",
  "ach",
]);
// "fin" and "ila" are also ordinary words in French and Spanish; they only count with a second hit.
const WEAK_DARIJA = new Set([
  "fin",
  "ila",
  "bach",
  "dak",
  "dik",
  "hna",
  "safi",
  "salam",
  "slm",
  "saha",
  "sa7a",
  "afak",
  "ach",
]);

/** Darija written in Arabic script. */
const ARABIC_DARIJA = new Set([
  "شنو",
  "شنوهي",
  "شنوهو",
  "كيفاش",
  "واش",
  "علاش",
  "شحال",
  "ديال",
  "ديالي",
  "ديالك",
  "هاد",
  "هادي",
  "هادا",
  "بغيت",
  "بغينا",
  "فين",
  "دابا",
  "غادي",
  "كاين",
  "ماكاينش",
  "مزيان",
  "بزاف",
  "ماشي",
  "راني",
  "ديالنا",
  "حقلي",
  "لحقل",
  "روطاسيون",
  "لعام",
  "ولا",
  "واخا",
  "نزرع",
  "كنزرع",
  "علاه",
  "لاباس",
  "شوية",
  "كلشي",
  "عافاك",
  "كيداير",
  "كيدايرة",
  "بسلامة",
  "خويا",
  "صافي",
  "فاش",
  "منين",
]);

const FRENCH_WORDS = new Set([
  "le",
  "la",
  "les",
  "des",
  "une",
  "un",
  "est",
  "sont",
  "pour",
  "quelle",
  "quel",
  "quels",
  "quelles",
  "comment",
  "pourquoi",
  "mon",
  "ma",
  "mes",
  "avec",
  "dans",
  "sur",
  "que",
  "qui",
  "du",
  "au",
  "aux",
  "cette",
  "ce",
  "ces",
  "quand",
  "combien",
  "meilleure",
  "meilleur",
  "champ",
  "rotation",
  "saison",
  "saisons",
  "pluie",
  "culture",
  "cultures",
  "peut",
  "faut",
  "plus",
  "moins",
  "très",
  "ou",
  "où",
  "et",
  "je",
  "tu",
  "nous",
  "vous",
  "il",
  "elle",
  "pas",
  "ne",
]);
const ENGLISH_WORDS = new Set([
  "the",
  "what",
  "which",
  "how",
  "why",
  "when",
  "is",
  "are",
  "was",
  "my",
  "me",
  "of",
  "to",
  "and",
  "show",
  "tell",
  "can",
  "you",
  "do",
  "does",
  "for",
  "in",
  "on",
  "it",
  "this",
  "that",
  "best",
  "field",
  "rotation",
  "season",
  "rain",
  "please",
  "hello",
  "hi",
  "thanks",
  "thank",
  "about",
]);
const FRENCH_ACCENT = /[àâçéèêëîïôùûüœ]/i;

// A Latin word that mixes letters with 2, 3, 5-9 (arabizi): "l3am", "7a9l", "3lach".
// Identifiers such as "ET0", "SSP2" or "rot2" end in a digit after a short run of letters: skipped.
const ARABIZI_WORD = /^(?=[a-z0-9]*[a-z])(?=[a-z0-9]*[235-9])[a-z0-9]{3,}$/i;
const IDENTIFIER = /^[A-Za-z]{1,4}\d+$/;

function words(text: string): string[] {
  return (text.normalize("NFC").toLowerCase().match(WORD) ?? []).map((w) =>
    w.replace(/^_+|_+$/g, ""),
  );
}

export function detectLanguage(text: string): Language {
  const letters = text.match(ARABIC_LETTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (letters === 0 && latin === 0) return UNSURE;

  const tokens = words(text);
  if (letters > 0 && letters >= latin) {
    const darija = tokens.some((w) => ARABIC_DARIJA.has(w));
    return { lang: "ar", script: "arabic", darija, sure: true };
  }

  let strong = 0;
  let weak = 0;
  for (const w of tokens) {
    if (LATIN_DARIJA.has(w)) {
      if (WEAK_DARIJA.has(w)) weak++;
      else strong++;
    } else if (/\d/.test(w) && !IDENTIFIER.test(w) && ARABIZI_WORD.test(w) && !/^\d+$/.test(w)) {
      strong++;
    }
  }
  if (strong >= 1 || weak >= 2) return { lang: "ar", script: "latin", darija: true, sure: true };

  const french = tokens.filter((w) => FRENCH_WORDS.has(w)).length;
  if (french >= 2 || (french >= 1 && FRENCH_ACCENT.test(text))) {
    return { lang: "fr", script: "latin", darija: false, sure: true };
  }
  return tokens.some((w) => ENGLISH_WORDS.has(w)) ? ENGLISH : UNSURE;
}

/** One sentence for the system prompt telling the model which language and script to answer in. */
export function languageInstruction(language: Language): string {
  if (!language.sure) {
    return "Reply in the same language and script as the user's message (English, French, or Darija, in Arabic script or Latin letters); if you cannot tell, use English.";
  }
  if (language.lang === "fr") return "Reply in French (français), in clear, simple sentences.";
  if (language.lang === "ar" && language.script === "latin") {
    return "Reply in Darija written with Latin letters and digits (arabizi), the way the user wrote, in short simple sentences. Keep crop, product and unit names recognisable.";
  }
  if (language.lang === "ar" && language.darija) {
    return "Reply in Darija (Moroccan or Algerian Arabic dialect) written in Arabic script, in short simple sentences. Keep crop, product and unit names recognisable.";
  }
  if (language.lang === "ar") return "Reply in simple Modern Standard Arabic, in Arabic script.";
  return "Reply in English, in clear, simple sentences.";
}
