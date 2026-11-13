import type { IntentClass } from "@itza/ui-kit/catalog";
import { type CopyKey, t } from "../../copy";
import { glossaryTermIds } from "../../glossary";

/** The ten intents the assistant answers from templates, with the question that stands for each. */
export const TEMPLATE_INTENTS = [
  "compare_rotations",
  "season_replay",
  "season_snapshot",
  "future_2050",
  "explain_evidence",
  "climate_context",
  "map_layer",
  "confirm_settings",
  "define_term",
  "general",
] as const satisfies readonly IntentClass[];

export type TemplateIntent = (typeof TEMPLATE_INTENTS)[number];

export const exampleQuestion = (intent: TemplateIntent): string =>
  t(`assistant.tpl.example.${intent}` as CopyKey);

interface Rule {
  re: RegExp;
  weight: number;
}

const rule = (re: RegExp, weight: number): Rule => ({ re, weight });

/** Keyword rules per intent, applied to the lower-cased question. The highest total wins. */
const RULES: Record<TemplateIntent, Rule[]> = {
  future_2050: [rule(/\b(2050|future|climate change|warmer|warming|ssp|scenario)\b/, 6)],
  season_snapshot: [
    rule(/\b(hardest|worst|driest|toughest) season\b/, 4),
    rule(/\bwhat happened\b/, 3),
    rule(/\b(19|20)\d{2}\b/, 2),
  ],
  season_replay: [
    rule(/\b(replay|backtest|past seasons|bad years?|stress)\b/, 6),
    rule(/\bhow (would|did) .*\b(do|fare|perform|cope)\b/, 2),
  ],
  compare_rotations: [
    rule(/\b(compare|which rotation|best rotation|held up best|alternatives?|options?)\b/, 3),
    rule(/\bbest\b/, 1),
  ],
  explain_evidence: [
    rule(/\b(why|explain|evidence|ranked|top rotation|what makes)\b/, 2),
    rule(/\b(ranked first|top rotation)\b/, 2),
  ],
  climate_context: [
    rule(/\b(which|how many) seasons\b/, 3),
    rule(/\b(my field|this field|how big|know about|summary|climate|weather)\b/, 2),
  ],
  map_layer: [
    rule(/\b(show|display|open|switch to|put)\b.*\b(layer|on the map|zones?|map)\b/, 4),
    rule(/\b(ndvi|moisture|frost|heat|rain)\b.*\b(layer|map)\b/, 2),
  ],
  confirm_settings: [
    rule(
      /\b(priorit\w*|matters? (the )?most|livestock|sheep|goats?|cattle|cows|i keep|irrigat\w*|little water|no water|constraint|limits?)\b/,
      3,
    ),
    rule(/\b(suit me|for me)\b/, 1),
  ],
  define_term: [],
  general: [rule(/\b(help|what can you|how do you work|what do you do)\b/, 4)],
};

const DEFINE_START = /^(what('s| is| are| does)|define|explain|meaning of|tell me what)\b/;

/** The glossary term the question names, if any. */
export function glossaryHit(question: string): string | null {
  const q = question.toLowerCase();
  for (const id of glossaryTermIds) {
    const label = t(`glossary.${id}.label` as CopyKey).toLowerCase();
    const title = t(`glossary.${id}.title` as CopyKey).toLowerCase();
    if (
      new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q) ||
      q.includes(title)
    ) {
      return id;
    }
  }
  return null;
}

export interface IntentMatch {
  intent: TemplateIntent;
  /** False when no rule fired: the answer is the general help. */
  matched: boolean;
}

/** Picks the intent of a question by keywords. A question that fires no rule gets the general help. */
export function matchIntent(question: string): IntentMatch {
  const q = question.toLowerCase().trim();
  const scores = new Map<TemplateIntent, number>();
  for (const intent of TEMPLATE_INTENTS) {
    scores.set(
      intent,
      RULES[intent].reduce((sum, r) => sum + (r.re.test(q) ? r.weight : 0), 0),
    );
  }
  // "What is NDVI?" is a definition; "show the NDVI layer" is not, so the wording must ask for one.
  if (DEFINE_START.test(q)) scores.set("define_term", glossaryHit(q) ? 8 : 2);
  let best: TemplateIntent = "general";
  let top = 0;
  for (const intent of TEMPLATE_INTENTS) {
    const score = scores.get(intent) ?? 0;
    if (score > top) {
      top = score;
      best = intent;
    }
  }
  return { intent: best, matched: top > 0 };
}
