import { bind, buildSurface, DATA_PATHS, EXAMPLES, validateAnswer } from "@itza/ui-kit/catalog";
import { describe, expect, it } from "vitest";
import { surfaceFromInput, withoutSources } from "./surface";

describe("surfaceFromInput", () => {
  it("accepts the model's own valid messages", () => {
    expect(surfaceFromInput({ messages: EXAMPLES.RotationCompare })).toBe(EXAMPLES.RotationCompare);
  });

  it("rejects invalid messages", () => {
    expect(surfaceFromInput({ messages: [{ nope: true }] })).toBeNull();
  });

  it("builds the layout for an intent with the model's caption", () => {
    const built = surfaceFromInput({
      intent: "compare_rotations",
      caption: "La rotation A est la meilleure.",
    });
    expect(JSON.stringify(built)).toContain("La rotation A est la meilleure.");
    expect(JSON.stringify(built)).toContain("RotationCompare");
  });

  it("passes the options the intent needs", () => {
    expect(
      JSON.stringify(
        surfaceFromInput({ intent: "season_snapshot", caption: "Saison 2012.", year: 2012 }),
      ),
    ).toContain("2012");
    expect(
      JSON.stringify(surfaceFromInput({ intent: "map_layer", caption: "Carte.", layer: "ndvi" })),
    ).toContain("ndvi");
    expect(
      JSON.stringify(
        surfaceFromInput({ intent: "confirm_settings", caption: "Vérifiez.", kind: "constraints" }),
      ),
    ).toContain("constraints");
    expect(
      JSON.stringify(surfaceFromInput({ intent: "future_2050", caption: "2050.", rotation: "r2" })),
    ).toContain("r2");
  });

  it("ignores options with the wrong type and still builds a valid layout", () => {
    const built = surfaceFromInput({
      intent: "map_layer",
      caption: "Carte.",
      layer: "lava",
      year: 20.5,
    });
    expect(built).not.toBeNull();
    expect(JSON.stringify(built)).not.toContain("lava");
  });

  it("rejects a missing or unknown intent, a missing caption, a markup caption and no input", () => {
    expect(surfaceFromInput({ caption: "x" })).toBeNull();
    expect(surfaceFromInput({ intent: "weather", caption: "x" })).toBeNull();
    expect(surfaceFromInput({ intent: "general" })).toBeNull();
    expect(surfaceFromInput({ intent: "general", caption: "<b>hi</b>" })).toBeNull();
    expect(surfaceFromInput(undefined)).toBeNull();
  });

  it("adds the model's follow-up chips and skips malformed ones", () => {
    const built = surfaceFromInput({
      intent: "general",
      caption: "Voici.",
      chips: [
        { label: "Pourquoi 2018 ?", question: "Pourquoi 2018 est-elle la plus difficile ?" },
        { label: "", question: "Empty label?" },
        { label: "No question" },
        "nope",
        null,
      ],
    });
    const text = JSON.stringify(built);
    expect(text).toContain("Pourquoi 2018 est-elle la plus difficile ?");
    expect(text.match(/"name":"ask"/g)).toHaveLength(1);
  });

  it("drops a chip question that is not plain text instead of showing it", () => {
    expect(
      surfaceFromInput({
        intent: "general",
        caption: "x.",
        chips: [{ label: "Go", question: "Visit https://x.test" }],
      }),
    ).toBeNull();
  });
});

describe("withoutSources", () => {
  const caption = { id: "cap", component: "Caption", text: "A plain sentence." };
  const footer = [
    { id: "src", component: "SourceChips", data: bind(DATA_PATHS.provenance) },
    { id: "trace", component: "TraceDrawer", data: bind(DATA_PATHS.trace) },
  ];

  it("removes the sources row and the trace drawer and keeps a valid layout", () => {
    const surface = buildSurface([caption, ...footer] as never);
    const cleaned = withoutSources(surface);
    const text = JSON.stringify(cleaned);
    expect(text).not.toContain("SourceChips");
    expect(text).not.toContain("TraceDrawer");
    expect(text).toContain("A plain sentence.");
    expect(validateAnswer(cleaned).ok).toBe(true);
  });

  it("leaves a surface without them as it is", () => {
    const surface = buildSurface([caption] as never);
    expect(withoutSources(surface)).toEqual(surface);
  });
});
