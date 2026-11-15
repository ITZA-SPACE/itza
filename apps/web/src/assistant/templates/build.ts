import {
  checkGrounding,
  detectLanguage,
  FALLBACK_CAPTION_KEYS,
  type FallbackOptions,
  fallbackSurface,
  type IntentClass,
  validateAnswer,
} from "@itza/ui-kit/catalog";
import type { CopyKey } from "../../copy";
import { signed, sspLabel } from "../../future/labels";
import { fmt } from "../../lib/format";
import { type Locale, localeOf, tl } from "../locale";
import { type ClientToolName, runTool, type ToolDeps, type ToolOutcome } from "../tools";
import { exampleQuestion, matchIntent, TEMPLATE_INTENTS, type TemplateIntent } from "./intents";
import { cropIn, layerIn, settingsIn, termIn, yearIn } from "./params";

export interface TemplateStep {
  name: ClientToolName;
  input: Record<string, unknown>;
  outcome: ToolOutcome;
}

export interface TemplateAnswer {
  intent: IntentClass;
  caption: string;
  surface: ReturnType<typeof fallbackSurface>;
  steps: TemplateStep[];
  /** Plain lines shown under the answer (the help list). */
  extra: string[];
  /** Language of the question; the answer's own text is in it when the assistant has copy for it. */
  locale: Locale;
}

const n2 = (x: unknown) => (typeof x === "number" ? x.toFixed(2) : "");
const CAPTION_MAX = 380;
const HELP_CHIPS = 4;
const clip = (s: string) =>
  s.length <= CAPTION_MAX ? s : `${s.slice(0, CAPTION_MAX - 1).trimEnd()}…`;

interface Row {
  id: string;
  name: string;
  is_baseline: boolean;
  score: number;
  headline: string;
}

interface Plan {
  intent: TemplateIntent;
  caption: string;
  options: FallbackOptions;
  extra: string[];
}

/** Runs the browser tools one intent needs and words the caption from their results. */
async function plan(
  question: string,
  intent: TemplateIntent,
  deps: ToolDeps,
  steps: TemplateStep[],
  locale: Locale,
): Promise<Plan> {
  const t = (key: CopyKey) => tl(locale, key);
  const call = async (
    name: ClientToolName,
    input: Record<string, unknown>,
  ): Promise<ToolOutcome> => {
    const outcome = await runTool(name, input, deps);
    steps.push({ name, input, outcome });
    return outcome;
  };
  const { view } = await deps.ready();
  const crops = deps.crops(view.packId);
  const base: Plan = { intent, caption: "", options: {}, extra: [] };
  const examples = TEMPLATE_INTENTS.filter((i) => i !== "general").map((i) =>
    exampleQuestion(i, locale),
  );

  const compare = async () => {
    const out = await call("compare_rotations", {});
    const rows = (out.output.rotations ?? []) as Row[];
    const lead = rows.find((r) => !r.is_baseline) ?? rows[0];
    return { rows, lead, baseline: rows.find((r) => r.is_baseline) };
  };

  switch (intent) {
    case "compare_rotations": {
      const { lead, baseline } = await compare();
      if (!lead) return base;
      return {
        ...base,
        caption:
          baseline && baseline !== lead
            ? fmt(t("assistant.tpl.compare"), {
                lead: lead.name,
                score: n2(lead.score),
                base: baseline.name,
                baseScore: n2(baseline.score),
              })
            : fmt(t("assistant.tpl.compare.alone"), { lead: lead.name, score: n2(lead.score) }),
      };
    }
    case "explain_evidence": {
      const { lead } = await compare();
      if (!lead) return base;
      return {
        ...base,
        caption: fmt(t("assistant.tpl.evidence"), { name: lead.name, headline: lead.headline }),
      };
    }
    case "season_replay":
    case "future_2050": {
      const { rows, lead } = await compare();
      const wanted = cropIn(question, crops) ?? lead?.id;
      if (!wanted) return base;
      const future = intent === "future_2050";
      const out = (
        await call("run_backtest", { rotation: wanted, ...(future ? { scenario: "2050" } : {}) })
      ).output;
      if (out.found === false) {
        return {
          ...base,
          intent: "compare_rotations",
          caption: t("assistant.tpl.notfound"),
          options: {},
        };
      }
      if (future && out.scenario === "2050") {
        return {
          ...base,
          options: { rotation: String(out.id) },
          caption: fmt(t("assistant.tpl.future"), {
            ssp: sspLabel(String(out.ssp)),
            name: String(out.name),
            change: signed(Number(out.score_change)),
            min: signed(Number(out.score_change_min)),
            max: signed(Number(out.score_change_max)),
          }),
        };
      }
      void rows;
      return {
        ...base,
        intent: "season_replay",
        caption: future
          ? t("assistant.tpl.future.missing")
          : fmt(t("assistant.tpl.replay"), {
              name: String(out.name),
              median: n2(out.median),
              worst: n2(out.worst),
              season: String(out.hardest_season),
              severe: String(out.severe_water_stress_seasons),
            }),
      };
    }
    case "season_snapshot": {
      let year = yearIn(question);
      const summary = await call("get_field_summary", {});
      if (year === null) year = Number(String(summary.output.hardest_season ?? "").slice(0, 4));
      const out = (await call("get_season", { year })).output;
      if (out.found === false) {
        const seasons = (out.seasons ?? []) as string[];
        return {
          ...base,
          intent: "climate_context",
          caption: fmt(t("assistant.tpl.snapshot.missing"), {
            year: String(year),
            first: seasons[0] ?? "",
            last: seasons.at(-1) ?? "",
          }),
        };
      }
      return {
        ...base,
        options: { year },
        caption: fmt(t("assistant.tpl.snapshot"), {
          season: String(out.season),
          rain: String(out.rain_mm),
          ndvi: n2(out.peak_ndvi),
        }),
      };
    }
    case "climate_context":
    case "map_layer": {
      const out = (await call("get_field_summary", {})).output;
      if (intent === "map_layer") {
        const layer = layerIn(question);
        return {
          ...base,
          options: { layer },
          caption: fmt(t("assistant.tpl.map"), { layer: t(`assistant.layer.${layer}` as CopyKey) }),
        };
      }
      const scores = ((out.season_scores ?? []) as { mean_score: number }[]).map(
        (s) => s.mean_score,
      );
      if (scores.length === 0) return base;
      return {
        ...base,
        caption: fmt(t("assistant.tpl.climate"), {
          count: String(out.seasons_replayed),
          season: String(out.hardest_season),
          min: n2(Math.min(...scores)),
          max: n2(Math.max(...scores)),
        }),
      };
    }
    case "confirm_settings": {
      const guess = settingsIn(question);
      if (guess.constraints) {
        await call("set_constraints", { constraints: guess.constraints });
        return { ...base, options: { kind: "constraints" }, caption: t("assistant.tpl.settings") };
      }
      await call("set_priorities", { priorities: guess.priorities ?? {} });
      return {
        ...base,
        options: { kind: "priorities" },
        caption: t(guess.priorities ? "assistant.tpl.settings" : "assistant.tpl.settings.none"),
      };
    }
    case "define_term": {
      const out = (await call("define_term", { term: termIn(question) })).output;
      return {
        ...base,
        caption:
          out.found === false
            ? t("assistant.term.unknown")
            : fmt(t("assistant.tpl.term"), {
                term: String(out.term),
                definition: String(out.definition),
              }),
      };
    }
    default:
      return {
        ...base,
        intent: "general",
        caption: t("assistant.tpl.general"),
        // The first four example questions are chips to tap; the rest are listed under the answer.
        options: {
          chips: examples.slice(0, HELP_CHIPS).map((question) => ({
            label: question.length <= 40 ? question : `${question.slice(0, 37).trimEnd()}…`,
            question,
          })),
        },
        extra: examples.slice(HELP_CHIPS),
      };
  }
}

/**
 * Answers a question without the language model: matches an intent, runs the browser tools it needs
 * and fills the predefined layout. The caption is checked against the tool results and the surface
 * against the catalog; if either fails, a plain caption replaces it, so the answer is never wrong
 * or broken.
 */
export async function runTemplate(question: string, deps: ToolDeps): Promise<TemplateAnswer> {
  const { intent, matched } = matchIntent(question);
  const locale = localeOf(detectLanguage(question));
  const steps: TemplateStep[] = [];
  const planned = await plan(question, matched ? intent : "general", deps, steps, locale);
  const outputs = steps.map((s) => s.outcome.output);
  const build = (caption: string) =>
    fallbackSurface(planned.intent, clip(caption), planned.options);

  let caption = planned.caption || tl(locale, FALLBACK_CAPTION_KEYS[planned.intent] as CopyKey);
  let surface = build(caption);
  const grounded = checkGrounding([clip(caption)], outputs).ok;
  if (!grounded || !validateAnswer(surface).ok) {
    caption = tl(locale, FALLBACK_CAPTION_KEYS[planned.intent] as CopyKey);
    surface = build(caption);
  }
  return { intent: planned.intent, caption, surface, steps, extra: planned.extra, locale };
}
