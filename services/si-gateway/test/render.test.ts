import { detectLanguage, EXAMPLES, fallbackSurface, INTENT_CLASSES } from "@itza/ui-kit/catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../src/index";
import { collectTurnOutputs, countFailedRenders, createRenderAnswerTool } from "../src/render";
import { chatRequest, env, fakeMcp, mockModel, question, textTurn, toolCallTurn } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const season = (output: unknown) => ({
  role: "assistant",
  parts: [
    {
      type: "tool-get_season",
      toolCallId: "c1",
      state: "output-available",
      input: { year: 2012 },
      output,
    },
  ],
});
const user = { role: "user", parts: [{ type: "text", text: "How was 2012?" }] };

function surfaceWithCaption(text: string) {
  return fallbackSurface("season_snapshot", text, { year: 2012 });
}

async function run(
  tool: ReturnType<typeof createRenderAnswerTool>,
  messages: unknown[],
  intent?: "season_snapshot",
) {
  return (await tool.execute?.({ messages, intent } as never, {} as never)) as Record<
    string,
    unknown
  >;
}

describe("turn outputs", () => {
  it("collects tool outputs since the last user message, without render_answer, unwrapping provenance", () => {
    const messages = [
      season({ old: 1 }),
      user,
      season({ rain_mm: 312 }),
      {
        role: "assistant",
        parts: [
          {
            type: "tool-power_get_point_statistics",
            state: "output-available",
            output: { untrusted_data: { t: 21 }, provenance: {} },
          },
          { type: "dynamic-tool", toolName: "x", state: "output-available", output: 7 },
          { type: "dynamic-tool", state: "output-available", output: "no name" },
          { type: "tool-get_season", state: "input-streaming" },
          { type: "tool-render_answer", state: "output-available", output: { status: "ok" } },
          { type: "text" },
        ],
      },
    ] as never[];
    expect(collectTurnOutputs(messages)).toEqual([{ rain_mm: 312 }, { t: 21 }, 7]);
  });

  it("counts failed render attempts in the turn only", () => {
    const failed = (status: string) => ({
      role: "assistant",
      parts: [{ type: "tool-render_answer", state: "output-available", output: { status } }],
    });
    const messages = [
      failed("error"),
      user,
      failed("error"),
      failed("ok"),
      failed("fallback"),
    ] as never[];
    expect(countFailedRenders(messages)).toBe(2);
    expect(countFailedRenders([user] as never[])).toBe(0);
  });
});

describe("render_answer tool", () => {
  it("accepts a valid, grounded surface", async () => {
    const tool = createRenderAnswerTool([{ year: 2012, rain_mm: 312.46 }], 0);
    expect(await run(tool, surfaceWithCaption("Rain was 312 mm in 2012."))).toEqual({
      status: "ok",
      droppedActions: 0,
    });
  });

  it("accepts the catalog examples", async () => {
    const tool = createRenderAnswerTool([], 0);
    expect((await run(tool, EXAMPLES.RotationCompare)).status).toBe("ok");
  });

  it("reports dropped actions", async () => {
    const tool = createRenderAnswerTool([], 0);
    const messages = structuredClone(EXAMPLES.ActionChips) as {
      updateComponents?: { components: { chips?: unknown[] }[] };
    }[];
    const chips = messages[1]?.updateComponents?.components.find((c) => c.chips);
    chips?.chips?.push({ label: "Wipe", action: { name: "wipe" } });
    expect(await run(tool, messages as never)).toEqual({ status: "ok", droppedActions: 1 });
  });

  it("returns VALIDATION_FAILED once, then signals the fallback with the intent", async () => {
    const tool = createRenderAnswerTool([], 0);
    const bad = surfaceWithCaption("<b>hi</b>");
    const first = await run(tool, bad, "season_snapshot");
    expect(first).toMatchObject({ status: "error", code: "VALIDATION_FAILED" });
    expect(String(first.errors)).toContain("text must be plain");
    expect(await run(tool, bad, "season_snapshot")).toEqual({
      status: "fallback",
      code: "VALIDATION_FAILED",
      intent: "season_snapshot",
    });
  });

  it("fails grounding for unsupported caption numbers and data-model numbers", async () => {
    const tool = createRenderAnswerTool([{ rain_mm: 312 }], 0);
    const first = await run(tool, surfaceWithCaption("Rain was 999 mm."));
    expect(first).toMatchObject({ status: "error", code: "GROUNDING_FAILED" });
    expect(String(first.errors)).toContain("999");

    const fake = [
      ...surfaceWithCaption("Plain caption."),
      {
        version: "v0.9",
        updateDataModel: { surfaceId: "answer", path: "/season/current", value: { rain_mm: 4242 } },
      },
    ];
    const second = createRenderAnswerTool([{ rain_mm: 312 }], 0);
    expect(String((await run(second, fake)).errors)).toContain("4242");
  });

  it("goes straight to the fallback when an earlier request already failed once", async () => {
    const tool = createRenderAnswerTool([], 1);
    expect((await run(tool, surfaceWithCaption("<i>x</i>"))).status).toBe("fallback");
  });
});

const surfaceCall = (text: string) => ({
  messages: surfaceWithCaption(text),
  intent: "season_snapshot",
});

describe("render_answer through /chat", () => {
  it("returns a validation error to the model, then accepts the corrected surface", async () => {
    const model = mockModel("gemini", [
      toolCallTurn("render_answer", surfaceCall("<b>bad</b>")),
      toolCallTurn("render_answer", surfaceCall("Rain was 312 mm.")),
      textTurn("Done."),
    ]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const body = {
      messages: [user, season({ rain_mm: 312 })],
    };
    const text = await (await gateway.fetch(chatRequest(body), env)).text();
    expect(text).toContain("VALIDATION_FAILED");
    expect(text).toContain('"status":"ok"');
    // The self-correction call saw the error result.
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain("VALIDATION_FAILED");
  });

  it("signals the fallback after a second failure", async () => {
    const model = mockModel("gemini", [
      toolCallTurn("render_answer", surfaceCall("Rain was 999 mm.")),
      toolCallTurn("render_answer", surfaceCall("Rain was 998 mm.")),
      textTurn("Using the default view."),
    ]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const text = await (
      await gateway.fetch(chatRequest({ messages: [user, season({ rain_mm: 312 })] }), env)
    ).text();
    expect(text).toContain("GROUNDING_FAILED");
    expect(text).toContain('"status":"fallback"');
  });

  it("grounds captions in server tool results from the same request", async () => {
    const model = mockModel("gemini", [
      toolCallTurn("power_get_point_statistics", {}),
      toolCallTurn("render_answer", surfaceCall("Mean temperature was 21.4 degrees.")),
      textTurn("Done."),
    ]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const text = await (await gateway.fetch(chatRequest(question), env)).text();
    expect(text).toContain('"status":"ok"');
  });

  it("accepts render_answer results sent back by the client in the messages", async () => {
    const model = mockModel("gemini", [textTurn("ok")]);
    const gateway = createGateway({ model: () => model, connectMcp: fakeMcp() });
    const prior = {
      role: "assistant",
      parts: [
        {
          type: "tool-render_answer",
          toolCallId: "r1",
          state: "output-available",
          input: surfaceCall("Plain."),
          output: { status: "error", code: "VALIDATION_FAILED" },
        },
      ],
    };
    const res = await gateway.fetch(chatRequest({ messages: [user, prior] }), env);
    expect(res.status).toBe(200);
    await res.text();
  });
});

describe("render_answer with an intent and a caption", () => {
  const call = async (
    tool: ReturnType<typeof createRenderAnswerTool>,
    input: Record<string, unknown>,
  ) => (await tool.execute?.(input as never, {} as never)) as Record<string, unknown>;

  it("builds a valid layout for every intent", async () => {
    for (const intent of INTENT_CLASSES) {
      const tool = createRenderAnswerTool([], 0);
      expect(await call(tool, { intent, caption: "A plain sentence." }), intent).toEqual({
        status: "ok",
        droppedActions: 0,
      });
    }
  });

  it("passes the options an intent needs", async () => {
    const tool = createRenderAnswerTool([{ year: 2012 }], 0);
    const out = await call(tool, {
      intent: "season_snapshot",
      caption: "Season 2012.",
      year: 2012,
    });
    expect(out.status).toBe("ok");
  });

  it("grounds the caption: an invented number fails once, then falls back", async () => {
    const tool = createRenderAnswerTool([{ rain_mm: 312 }], 0);
    const bad = { intent: "season_snapshot", caption: "Rain was 999 mm." };
    expect(await call(tool, bad)).toMatchObject({ status: "error", code: "GROUNDING_FAILED" });
    expect(await call(tool, bad)).toEqual({
      status: "fallback",
      code: "GROUNDING_FAILED",
      intent: "season_snapshot",
    });
  });

  it("rejects markup in the caption and tells the model the simple call that works", async () => {
    const tool = createRenderAnswerTool([], 0);
    const out = await call(tool, { intent: "general", caption: "<b>hi</b>" });
    expect(out).toMatchObject({ status: "error", code: "VALIDATION_FAILED" });
    expect(String(out.hint)).toContain('"intent"');
  });

  it("refuses a call with neither messages nor an intent and a caption", async () => {
    const tool = createRenderAnswerTool([], 0);
    const schema = tool.inputSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(schema.safeParse({ intent: "general" }).success).toBe(false);
    expect(schema.safeParse({ caption: "x" }).success).toBe(false);
    expect(schema.safeParse({ intent: "general", caption: "x" }).success).toBe(true);
  });

  it("accepts follow-up chips and reports an unsafe question as a validation failure", async () => {
    const tool = createRenderAnswerTool([], 0);
    const ok = await call(tool, {
      intent: "general",
      caption: "A plain sentence.",
      chips: [{ label: "Why 2018?", question: "Why was 2018 the hardest season?" }],
    });
    expect(ok.status).toBe("ok");
    const bad = await call(createRenderAnswerTool([], 0), {
      intent: "general",
      caption: "A plain sentence.",
      chips: [{ label: "Open", question: "See https://evil.example" }],
    });
    expect(bad).toMatchObject({ status: "error", code: "VALIDATION_FAILED" });
  });

  it("refuses more than four chips at the schema", () => {
    const schema = createRenderAnswerTool([], 0).inputSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean };
    };
    const chip = { label: "Q", question: "A question?" };
    expect(
      schema.safeParse({ intent: "general", caption: "x", chips: [chip, chip, chip, chip] })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ intent: "general", caption: "x", chips: Array(5).fill(chip) }).success,
    ).toBe(false);
  });
});

describe("render_answer in one language", () => {
  const french = detectLanguage("Quelle rotation a le mieux résisté ?");
  const call = async (
    tool: ReturnType<typeof createRenderAnswerTool>,
    input: Record<string, unknown>,
  ) => (await tool.execute?.(input as never, {} as never)) as Record<string, unknown>;

  it("accepts a caption and chips in the user's language", async () => {
    const tool = createRenderAnswerTool([], 0, french);
    const out = await call(tool, {
      intent: "general",
      caption: "La rotation A est la meilleure pour votre champ.",
      chips: [{ label: "Pourquoi ?", question: "Pourquoi la rotation A est-elle la meilleure ?" }],
    });
    expect(out.status).toBe("ok");
  });

  it("rejects a caption in another language once, with the language to use, then falls back", async () => {
    const tool = createRenderAnswerTool([], 0, french);
    const bad = { intent: "general", caption: "Rotation A is the best choice for your field." };
    const first = await call(tool, bad);
    expect(first).toMatchObject({ status: "error", code: "LANGUAGE_MISMATCH" });
    expect(String(first.errors)).toContain("French");
    expect(await call(tool, bad)).toEqual({
      status: "fallback",
      code: "LANGUAGE_MISMATCH",
      intent: "general",
    });
  });

  it("rejects chips written in another language than the caption", async () => {
    const tool = createRenderAnswerTool([], 0, french);
    const out = await call(tool, {
      intent: "general",
      caption: "La rotation A est la meilleure pour votre champ.",
      chips: [{ label: "Why is that?", question: "Why is rotation A the best choice for me?" }],
    });
    expect(out).toMatchObject({ status: "error", code: "LANGUAGE_MISMATCH" });
  });

  it("lets text through when the user's language is unknown or not given", async () => {
    const english = { intent: "general", caption: "Rotation A is the best choice for your field." };
    expect((await call(createRenderAnswerTool([], 0, detectLanguage("ok")), english)).status).toBe(
      "ok",
    );
    expect((await call(createRenderAnswerTool([], 0), english)).status).toBe("ok");
  });

  it("checks the captions of a model-written surface too", async () => {
    const tool = createRenderAnswerTool([], 0, french);
    const surface = fallbackSurface("general", "Rotation A is the best choice for your field.");
    expect(await call(tool, { messages: surface })).toMatchObject({
      status: "error",
      code: "LANGUAGE_MISMATCH",
    });
  });
});
