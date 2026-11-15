import type { CompareResult, Weighted } from "@itza/engine/worker";
import { createReplayClient, createReplayHandler, type WorkerLike } from "@itza/engine/worker";
import { loadPack } from "@itza/knowledge";
import { checkGrounding, validateAnswer } from "@itza/ui-kit/catalog";
import { beforeAll, describe, expect, it } from "vitest";
import bundle from "../../../../../fixtures/synthetic/semi-arid-winter-cereal.bundle.json";
import projection from "../../../public/bundles/semi-arid-winter-cereal/projection.json";
import { t } from "../../copy";
import { glossaryTermIds } from "../../glossary";
import { type Locale, localeOf, tl } from "../locale";
import type { ToolDeps } from "../tools";
import { runTemplate, type TemplateAnswer } from "./build";
import { exampleQuestion, matchIntent, TEMPLATE_INTENTS } from "./intents";
import { settingsIn, termIn } from "./params";

// The real engine, in process: the same handler the browser's worker runs.
function localClient() {
  const handler = createReplayHandler();
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = {
    postMessage: (message) => {
      const data = handler(message);
      queueMicrotask(() => {
        for (const l of listeners) l({ data });
      });
    },
    addEventListener: (type: string, listener: unknown) => {
      if (type === "message") listeners.push(listener as (event: { data: unknown }) => void);
    },
  } as WorkerLike;
  return createReplayClient(worker);
}

let deps: ToolDeps;

beforeAll(async () => {
  const client = localClient();
  const view = (await client.compare({
    bundle: bundle as never,
    input: {
      schema: "engine-input/1.0",
      soil: bundle.soil as never,
      priorities: {
        water: 3,
        soil_health: 3,
        nitrogen: 3,
        erosion: 3,
        forage: 3,
        income: 3,
        pest_break: 3,
      },
      constraints: { irrigation: { level: "none" }, livestock: false },
      scenario: { id: "history", kind: "history" },
      seed: 42,
      monte_carlo_draws: 40,
    },
  })) as CompareResult & Weighted;
  deps = {
    ready: async () => ({ view }),
    engine: () => client,
    projection: async () => projection,
    field: () => ({ areaHa: 12.4, centroid: [5.33, 36.12] }),
    navigate: () => {},
    crops: (packId) =>
      loadPack(packId)
        .crops.filter((c) => c.kind === "crop")
        .map((c) => ({ id: c.id, name: c.name })),
  };
}, 60_000);

const outputsOf = (a: TemplateAnswer) => a.steps.map((s) => s.outcome.output);

describe("intent matching", () => {
  it.each(TEMPLATE_INTENTS)("the example question of %s matches it", (intent) => {
    expect(matchIntent(exampleQuestion(intent)).intent).toBe(intent);
  });

  for (const locale of ["fr", "ar"] as const satisfies readonly Locale[]) {
    it.each(TEMPLATE_INTENTS)(`the ${locale} example question of %s matches it`, (intent) => {
      expect(matchIntent(exampleQuestion(intent, locale)).intent).toBe(intent);
    });
  }

  it("matches the suggested questions of every screen", () => {
    const expected: [string, string][] = [
      ["assistant.suggest.field", "climate_context"],
      ["assistant.suggest.history", "climate_context"],
      ["assistant.suggest.inputs", "confirm_settings"],
      ["assistant.suggest.compare", "compare_rotations"],
      ["assistant.suggest.compare.season", "season_snapshot"],
      ["assistant.suggest.compare.future", "future_2050"],
      ["assistant.suggest.twin", "map_layer"],
    ];
    for (const [key, intent] of expected) {
      expect(matchIntent(t(key as never)).intent, key).toBe(intent);
    }
  });

  it("takes any glossary term for a definition when the question asks what it is", () => {
    for (const id of glossaryTermIds) {
      const label = t(`glossary.${id}.label` as never);
      expect(matchIntent(`What is ${label}?`).intent, label).toBe("define_term");
    }
  });

  it("falls back to the help for a question it does not know", () => {
    expect(matchIntent("blah blah")).toEqual({ intent: "general", matched: false });
  });

  it("reads terms and settings out of a sentence", () => {
    expect(termIn("What does ET0 mean?")).toBe("ET0");
    expect(settingsIn("10 ha, little water, I keep sheep").constraints).toEqual({
      irrigation: "none",
      livestock: "yes",
    });
    expect(settingsIn("which rotation if water matters most").priorities).toEqual({ water: 1 });
    expect(settingsIn("hello")).toEqual({ constraints: null, priorities: null });
  });
});

describe("offline answers on the real engine", () => {
  for (const intent of TEMPLATE_INTENTS) {
    it(`${intent}: valid surface, grounded caption, tools called`, async () => {
      const answer = await runTemplate(exampleQuestion(intent), deps);
      expect(answer.intent).toBe(intent);
      expect(validateAnswer(answer.surface).ok).toBe(true);
      expect(checkGrounding([answer.caption], outputsOf(answer)).ok).toBe(true);
      if (intent !== "general") expect(answer.steps.length).toBeGreaterThan(0);
      expect(answer.caption.length).toBeGreaterThan(10);
    });
  }

  it("quotes real numbers from the tools", async () => {
    const a = await runTemplate("Which rotation held up best?", deps);
    const rows = a.steps[0]?.outcome.output.rotations as { score: number }[];
    expect(a.caption).toContain(rows[0]?.score.toFixed(2));
  });

  it("answers for a named season and says so when there is none", async () => {
    const found = await runTemplate("What happened in 2022?", deps);
    expect(found.intent).toBe("season_snapshot");
    expect(found.caption).toMatch(/mm of rain/);
    const missing = await runTemplate("What happened in 1985?", deps);
    expect(missing.caption).toMatch(/no replay for 1985/);
    expect(validateAnswer(missing.surface).ok).toBe(true);
  });

  it("uses a named crop and falls back to the comparison when it is not a candidate", async () => {
    const a = await runTemplate("Replay barley on past seasons", deps);
    expect(["season_replay", "compare_rotations"]).toContain(a.intent);
    expect(validateAnswer(a.surface).ok).toBe(true);
  });

  it("proposes constraints from a sentence and lists help for an unknown one", async () => {
    const settings = await runTemplate("I keep sheep and have little water", deps);
    expect(settings.intent).toBe("confirm_settings");
    expect(settings.steps[0]?.name).toBe("set_constraints");
    const help = await runTemplate("blah blah", deps);
    expect(help.intent).toBe("general");
    expect(help.extra).toHaveLength(5);
    expect(JSON.stringify(help.surface).match(/"name":"ask"/g)).toHaveLength(4);
    expect(validateAnswer(help.surface).ok).toBe(true);
  });

  it("says a term is not in the glossary", async () => {
    const a = await runTemplate("What is a zorblax?", deps);
    expect(a.caption).toBe(t("assistant.term.unknown"));
  });

  it("answers a French question in French, with a grounded caption", async () => {
    const a = await runTemplate("Quelle rotation a le mieux résisté ?", deps);
    expect(a.locale).toBe("fr");
    expect(a.intent).toBe("compare_rotations");
    expect(a.caption).toMatch(/arrive en tête avec un score de/);
    expect(checkGrounding([a.caption], outputsOf(a)).ok).toBe(true);
    expect(validateAnswer(a.surface).ok).toBe(true);
    const help = await runTemplate("Avec quoi pouvez-vous m'aider ?", deps);
    expect(JSON.stringify(help.surface)).toContain(exampleQuestion("compare_rotations", "fr"));
  });

  it("answers an Arabic-script Darija question in Arabic", async () => {
    const a = await runTemplate("شنو هي أحسن روطاسيون لحقلي؟", deps);
    expect(a.locale).toBe("ar");
    expect(a.caption).toMatch(/[\u0600-\u06FF]/);
    expect(checkGrounding([a.caption], outputsOf(a)).ok).toBe(true);
    expect(validateAnswer(a.surface).ok).toBe(true);
  });

  it("answers a question in Latin-letter Darija with Arabic text and the general help", async () => {
    const a = await runTemplate("chhal kant l3am l9ssi f had l7a9l?", deps);
    expect(a.locale).toBe("ar");
    expect(a.intent).toBe("general");
    expect(a.caption).toBe(tl("ar", "assistant.tpl.general"));
  });

  it("has French and Arabic text for every key it uses, with the same placeholders", async () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
    const keys = Object.keys(
      (await import("../../copy/assistant-locales/fr.json")).default as Record<string, string>,
    );
    for (const locale of ["fr", "ar"] as const) {
      for (const key of keys) {
        const english = tl("en", key as never);
        const local = tl(locale, key as never);
        expect(local, `${locale} ${key}`).toBeTruthy();
        expect(placeholders(local), `${locale} ${key}`).toBe(placeholders(english));
      }
    }
    expect(localeOf({ lang: "en", script: "latin", darija: false })).toBe("en");
  });
});
