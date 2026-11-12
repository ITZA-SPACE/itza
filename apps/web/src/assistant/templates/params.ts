import type { FallbackOptions } from "@itza/ui-kit/catalog";

type Layer = NonNullable<FallbackOptions["layer"]>;

/** A four-digit year in the question, if any. */
export function yearIn(question: string): number | null {
  const found = /\b((?:19|20)\d{2})\b/.exec(question);
  return found ? Number(found[1]) : null;
}

/** The crop of the region's list that the question names, by its full name or first word. */
export function cropIn(
  question: string,
  crops: readonly { id: string; name: string }[],
): string | null {
  const q = question.toLowerCase();
  const full = crops.find((c) => q.includes(c.name.toLowerCase()));
  if (full) return full.name;
  const word = crops.find((c) => {
    const first = c.name.toLowerCase().split(/[\s(]/)[0] ?? "";
    return first.length > 3 && new RegExp(`\\b${first}\\b`).test(q);
  });
  return word?.name ?? null;
}

/** The term after "what is", "define" and the like. */
export function termIn(question: string): string {
  return question
    .trim()
    .replace(/[?!.]+$/, "")
    .replace(/^(what('s| is| are| does)|define|explain|meaning of|tell me what)\s+/i, "")
    .replace(/^(an?|the)\s+/i, "")
    .replace(/\s+mean(s)?$/i, "")
    .trim();
}

export function layerIn(question: string): Layer {
  const q = question.toLowerCase();
  if (/\b(ndvi|green\w*|vegetation)\b/.test(q)) return "ndvi";
  if (/\b(moisture|wet|soil water)\b/.test(q)) return "moisture";
  if (/\b(rain\w*)\b/.test(q)) return "rain_anomaly";
  if (/\b(heat|hot)\b/.test(q)) return "heat_days";
  if (/\b(frost|cold)\b/.test(q)) return "frost_days";
  return "zones";
}

const PRIORITY_WORDS: [RegExp, string][] = [
  [/\b(water|drought|dry)\b/, "water"],
  [/\b(soil health|organic|soil)\b/, "soil_health"],
  [/\b(nitrogen)\b/, "nitrogen"],
  [/\b(erosion)\b/, "erosion"],
  [/\b(forage|feed|fodder)\b/, "forage"],
  [/\b(income|profit|money|market)\b/, "income"],
  [/\b(pests?|disease)\b/, "pest_break"],
];

export interface SettingsGuess {
  /** Inputs for `set_constraints`, when the question names irrigation or livestock. */
  constraints: Record<string, string> | null;
  /** Inputs for `set_priorities`, 0 to 1, when it names what matters. */
  priorities: Record<string, number> | null;
}

/** Reads priorities and limits out of a sentence such as "little water, I keep sheep". */
export function settingsIn(question: string): SettingsGuess {
  const q = question.toLowerCase();
  const constraints: Record<string, string> = {};
  if (/\b(little water|no water|no irrigation|rain ?fed|rain only|dry)\b/.test(q)) {
    constraints.irrigation = "none";
  } else if (/\b(full irrigation|plenty of water)\b/.test(q)) constraints.irrigation = "full";
  else if (/\b(some irrigation|irrigat\w*)\b/.test(q)) constraints.irrigation = "supplemental";
  if (/\b(sheep|goats?|cattle|cows|livestock|animals)\b/.test(q)) constraints.livestock = "yes";
  const priorities: Record<string, number> = {};
  if (/\b(matters? (the )?most|priorit\w*|important)\b/.test(q)) {
    for (const [re, key] of PRIORITY_WORDS) if (re.test(q)) priorities[key] = 1;
  }
  return {
    constraints: Object.keys(constraints).length > 0 ? constraints : null,
    priorities: Object.keys(priorities).length > 0 ? priorities : null,
  };
}
