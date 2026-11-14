import { describe, expect, it } from "vitest";
import {
  A2UI_VERSION,
  ACTION_ALLOWLIST,
  bind,
  buildSurface,
  COMPONENT_NAMES,
  checkGrounding,
  DATA_PATHS,
  EXAMPLES,
  extractNumbers,
  FALLBACK_CAPTION_KEYS,
  fallbackSurface,
  INTENT_CLASSES,
  LIMITS,
  resolveAction,
  validateAnswer,
} from "../catalog";

type Msg = Record<string, unknown>;
const cap = { id: "cap", component: "Caption", text: "A plain sentence." };
const data = (id: string, component = "ClimateStrip") => ({
  id,
  component,
  data: bind(DATA_PATHS.climate),
});

function withComponents(...body: Msg[]): Msg[] {
  return buildSurface(body as never);
}

/** Replace a surface's component list. */
function custom(components: Msg[]): Msg[] {
  const [create] = buildSurface([]);
  return [
    create as Msg,
    { version: A2UI_VERSION, updateComponents: { surfaceId: "answer", components } },
  ];
}

const errorsOf = (messages: unknown): string => {
  const result = validateAnswer(messages);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join(" | ");
};

describe("examples", () => {
  it("has one example per catalog component", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...COMPONENT_NAMES].sort());
  });

  for (const name of COMPONENT_NAMES) {
    it(`example for ${name} validates and uses that component`, () => {
      const result = validateAnswer(EXAMPLES[name]);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok) expect(result.surface.components.map((c) => c.component)).toContain(name);
    });
  }

  it("keeps every example chip action on the allow-list", () => {
    const result = validateAnswer(EXAMPLES.ActionChips);
    expect(result.ok && result.surface.droppedActions).toBe(0);
  });
});

describe("rejects malformed surfaces", () => {
  it("rejects non-arrays and oversized lists", () => {
    expect(errorsOf("nope")).toContain("messages must be");
    expect(errorsOf([])).toContain("messages must be");
    expect(errorsOf(new Array(LIMITS.messages + 1).fill({}))).toContain("messages must be");
  });

  it("rejects an unknown component", () => {
    expect(errorsOf(withComponents(cap, { id: "x", component: "Script", src: "a" }))).toContain(
      'unknown component "Script"',
    );
    expect(errorsOf(withComponents(cap, { id: "x" }))).toContain("unknown component undefined");
  });

  it("rejects HTML, links and script URLs in text", () => {
    for (const text of [
      "<b>bold</b>",
      "see https://evil.test",
      "go to www.evil.test now",
      "protocol-relative //evil.test",
      "javascript:alert(1)",
      "data:text/html,hi",
      "bell \u0007",
    ]) {
      expect(errorsOf(withComponents({ ...cap, text })), text).toContain("text must be plain");
    }
  });

  it("rejects HTML hidden in chip labels and action context", () => {
    const chips = (label: string, context: Msg = {}) => ({
      id: "chips",
      component: "ActionChips",
      chips: [{ label, action: { name: "run_backtest", context } }],
    });
    expect(errorsOf(withComponents(cap, chips("<img src=x>")))).toContain("text must be plain");
    expect(errorsOf(withComponents(cap, chips("ok", { rotation: "<script>" })))).toContain(
      "text must be plain",
    );
  });

  it("rejects oversize props", () => {
    expect(errorsOf(withComponents({ ...cap, text: "x".repeat(LIMITS.textLength + 1) }))).toContain(
      "too long",
    );
    const many = Array.from({ length: LIMITS.chips + 1 }, () => ({
      label: "Go",
      action: { name: "open_future" },
    }));
    expect(
      errorsOf(withComponents(cap, { id: "c", component: "ActionChips", chips: many })),
    ).toContain("chips");
    const long = {
      id: "b",
      component: "ReplayBars",
      data: bind(DATA_PATHS.backtest),
      title: "t".repeat(81),
    };
    expect(errorsOf(withComponents(cap, long))).toContain("title");
  });

  it("rejects bad bindings and extra props", () => {
    const badPath = { id: "s", component: "ClimateStrip", data: { path: "https://x.test/a" } };
    expect(errorsOf(withComponents(cap, badPath))).toContain("path");
    const extra = { ...data("s"), html: "<b>" };
    expect(errorsOf(withComponents(cap, extra))).toContain("s");
  });

  it("rejects more than 3 data components", () => {
    const four = [
      data("a"),
      data("b", "EvidenceCard"),
      data("c", "ReplayBars"),
      data("d", "RotationCompare"),
    ];
    expect(errorsOf(withComponents(cap, ...four))).toContain("at most 3 data components");
    expect(validateAnswer(withComponents(cap, ...four.slice(0, 3))).ok).toBe(true);
  });

  it("enforces caption first, one caption, and chips-and-sources last", () => {
    expect(errorsOf(withComponents(data("a"), cap))).toContain("caption must come first");
    expect(errorsOf(withComponents(cap, { ...cap, id: "cap2" }))).toContain("use one Caption");
    const src = { id: "s", component: "SourceChips", data: bind(DATA_PATHS.provenance) };
    expect(errorsOf(withComponents(cap, src, data("a")))).toContain("then data components");
  });

  it("enforces one surface and one createSurface at the start", () => {
    const ok = withComponents(cap);
    const other = {
      version: A2UI_VERSION,
      updateDataModel: { surfaceId: "second", path: "/a/b", value: 1 },
    };
    expect(errorsOf([...ok, other])).toContain("only one surface per answer");
    expect(errorsOf([ok[1], ok[0]])).toContain("createSurface must appear once, first");
    expect(errorsOf([ok[0], ok[0], ok[1]])).toContain("createSurface must appear once, first");
    expect(errorsOf([ok[1]])).toContain("missing createSurface");
  });

  it("rejects bad envelopes", () => {
    const ok = withComponents(cap);
    expect(errorsOf([{ version: "v0.8", createSurface: {} }])).toContain("messages/0");
    expect(errorsOf([{ version: A2UI_VERSION }])).toContain("messages/0");
    const wrongCatalog = {
      version: A2UI_VERSION,
      createSurface: { surfaceId: "answer", catalogId: "other" },
    };
    expect(errorsOf([wrongCatalog, ok[1]])).toContain("messages/0");
  });

  it("rejects tree problems", () => {
    expect(errorsOf(custom([cap]))).toContain('id "root"');
    expect(errorsOf(custom([{ id: "root", component: "Caption", text: "hi" }]))).toContain(
      'id "root"',
    );
    const root = (children: string[]) => ({ id: "root", component: "Column", children });
    expect(errorsOf(custom([root(["cap", "ghost"]), cap]))).toContain("missing child ghost");
    expect(errorsOf(custom([root(["cap"]), cap, data("orphan")]))).toContain(
      "orphan is not reachable",
    );
    const shared = [
      root(["cap", "row1", "row2"]),
      cap,
      { id: "row1", component: "Row", children: ["a"] },
      { id: "row2", component: "Row", children: ["a"] },
      data("a"),
    ];
    expect(errorsOf(custom(shared))).toContain("a is used more than once");
    expect(errorsOf(custom([root(["cap", "cap"]), cap]))).toContain("children");
    expect(errorsOf(custom([root(["cap"]), cap, cap]))).toContain("duplicate id cap");
  });

  it("rejects nesting deeper than the limit", () => {
    const chain = ["root", "n1", "n2", "n3", "n4", "n5"];
    const layers = chain.slice(0, -1).map((id, i) => ({
      id,
      component: "Column",
      children: [chain[i + 1]],
    }));
    const tail = { id: "n5", component: "Column", children: ["cap"] };
    expect(errorsOf(custom([...layers, tail, cap]))).toContain("nesting deeper");
  });

  it("rejects too many components", () => {
    const comps = Array.from({ length: LIMITS.components + 1 }, (_, i) => ({
      ...cap,
      id: `c${i}`,
    }));
    expect(errorsOf(custom(comps))).toContain("components");
  });

  it("limits data-model updates", () => {
    const ok = withComponents(cap);
    const update = (value: unknown) => ({
      version: A2UI_VERSION,
      updateDataModel: { surfaceId: "answer", path: "/backtest/result", value },
    });
    expect(errorsOf([...ok, update("x".repeat(LIMITS.dataValueBytes))])).toContain("larger than");
    expect(errorsOf([...ok, update({ note: "<b>x</b>" })])).toContain("text must be plain");
    const good = validateAnswer([...ok, update({ rain: 12.5 })]);
    expect(good.ok && good.surface.dataValues).toEqual([{ rain: 12.5 }]);
  });
});

describe("action allow-list", () => {
  it("drops chips with unknown actions and keeps the rest", () => {
    const messages = withComponents(cap, {
      id: "chips",
      component: "ActionChips",
      chips: [
        { label: "Wipe data", action: { name: "delete_everything" } },
        { label: "Show 2050", action: { name: "open_future" } },
      ],
    });
    const result = validateAnswer(messages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.surface.droppedActions).toBe(1);
    const chips = result.surface.components.find((c) => c.component === "ActionChips");
    expect(chips?.chips).toEqual([{ label: "Show 2050", action: { name: "open_future" } }]);
  });

  it("removes the chips component when every chip is dropped", () => {
    const messages = withComponents(cap, {
      id: "chips",
      component: "ActionChips",
      chips: [{ label: "Bad", action: { name: "__proto__" } }],
    });
    const result = validateAnswer(messages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.surface.components.map((c) => c.id)).toEqual(["root", "cap"]);
      expect(result.surface.droppedActions).toBe(1);
    }
  });

  it("resolves allowed actions and rejects bad names or context", () => {
    expect(
      resolveAction({ name: "run_backtest", context: { rotation: "rot_b", scenario: "2050" } }),
    ).toEqual({
      kind: "tool",
      tool: "run_backtest",
      args: { rotation: "rot_b", scenario: "2050" },
    });
    expect(resolveAction({ name: "open_future" })).toEqual({
      kind: "navigate",
      view: "future",
      params: {},
    });
    expect(resolveAction({ name: "run_backtest" })).toBeNull();
    expect(
      resolveAction({ name: "run_backtest", context: { rotation: "x", extra: 1 } }),
    ).toBeNull();
    expect(resolveAction({ name: "set_priorities" })).toBeNull();
    expect(resolveAction({ name: "toString" })).toBeNull();
    for (const name of Object.keys(ACTION_ALLOWLIST)) {
      expect(["tool", "navigate"]).toContain(ACTION_ALLOWLIST[name]?.kind);
    }
  });
});

describe("fallback layouts", () => {
  it("exist for every intent class and every one validates", () => {
    expect(Object.keys(FALLBACK_CAPTION_KEYS).sort()).toEqual([...INTENT_CLASSES].sort());
    for (const intent of INTENT_CLASSES) {
      const result = validateAnswer(fallbackSurface(intent, "Plain caption without numbers."));
      expect(result.ok, `${intent}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it("honours options and defaults", () => {
    const find = (messages: Msg[], name: string) => {
      const r = validateAnswer(messages);
      return r.ok ? r.surface.components.find((c) => c.component === name) : undefined;
    };
    expect(
      find(fallbackSurface("season_snapshot", "c", { year: 2003 }), "SeasonSnapshot")?.year,
    ).toBe(2003);
    expect(find(fallbackSurface("season_snapshot", "c"), "SeasonSnapshot")?.year).toBe(2012);
    expect(
      find(fallbackSurface("future_2050", "c", { rotation: "rot_b" }), "FutureToggle")?.rotation,
    ).toBe("rot_b");
    expect(find(fallbackSurface("future_2050", "c"), "FutureToggle")?.rotation).toBe("current");
    expect(find(fallbackSurface("map_layer", "c", { layer: "ndvi" }), "MapFocus")?.layer).toBe(
      "ndvi",
    );
    expect(find(fallbackSurface("map_layer", "c"), "MapFocus")?.layer).toBe("zones");
    expect(
      find(fallbackSurface("confirm_settings", "c", { kind: "constraints" }), "ConfirmForm")?.kind,
    ).toBe("constraints");
    expect(find(fallbackSurface("confirm_settings", "c"), "ConfirmForm")?.kind).toBe("priorities");
  });
});

describe("grounding", () => {
  const outputs = [
    {
      seasons: [
        { year: 2012, rain_mm: 312.46, stress: 0.35 },
        { year: 2013, rain_mm: 501.2, stress: 0.1 },
      ],
    },
    { untrusted: "retrieved 2024-07-04" },
  ];

  it("passes text with no numbers", () => {
    expect(checkGrounding(["Nothing numeric here."], [])).toEqual({ ok: true, unsupported: [] });
  });

  it("passes supported and rounded numbers, years, dates and list lengths", () => {
    const text = [
      "Rain was 312 mm in 2012 and 312.5 mm when rounded.",
      "Stress reached 35% that year; 0.35 as a fraction; 1,000 is not claimed.".replace(
        "; 1,000 is not claimed",
        "",
      ),
      "Across 2 seasons, from 2024-07-04.",
      "Rain was 31 cm.",
    ];
    expect(checkGrounding(text, outputs)).toEqual({ ok: true, unsupported: [] });
  });

  it("fails a caption with an unsupported number", () => {
    const result = checkGrounding(["Rain was 999 mm and stress was 35%."], outputs);
    expect(result.ok).toBe(false);
    expect(result.unsupported).toEqual(["999"]);
  });

  it("fails when there are no tool outputs for a number", () => {
    expect(checkGrounding(["Yield rose 12%."], []).unsupported).toEqual(["12%"]);
  });

  it("does not count rounding beyond the written precision", () => {
    expect(checkGrounding(["Rain was 312.9 mm."], outputs).ok).toBe(false);
  });

  it("allows the 2050 scenario and ignores scenario names and identifiers", () => {
    expect(checkGrounding(["Under SSP2-4.5 in 2050, ET0 rises for rot2."], []).ok).toBe(true);
  });

  it("parses thousands separators and decimals", () => {
    const tokens = extractNumbers("About 1,234.5 mm or 12%");
    expect(tokens.map((t) => [t.value, t.decimals, t.percent])).toEqual([
      [1234.5, 1, false],
      [12, 0, true],
    ]);
    expect(checkGrounding(["About 1,234.5 mm"], [{ rain: 1234.5 }]).ok).toBe(true);
  });

  it("ignores non-finite output values", () => {
    expect(checkGrounding(["It was 5."], [{ a: Number.NaN, b: null }]).ok).toBe(false);
  });
});
