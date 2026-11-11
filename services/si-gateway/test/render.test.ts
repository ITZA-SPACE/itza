import { EXAMPLES, fallbackSurface } from "@itza/ui-kit/catalog";
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
