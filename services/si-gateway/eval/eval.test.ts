import { checkGrounding, validateAnswer } from "@itza/ui-kit/catalog";
import { describe, expect, it } from "vitest";
import { createGateway } from "../src/index";
import { chatRequest, env, fakeMcp, mockModel, textTurn, toolCallTurn } from "../test/helpers";
import { EVAL_CASES, type EvalCase, surfaceOf } from "./cases";

/**
 * Replays each scripted question through the gateway the way the browser does it: a first request
 * where the model calls a browser tool, then a second one that carries the tool's result, where the
 * model builds the answer. The provider is a recording. Each case must call at least one tool, give
 * a surface that passes the catalog and a caption whose numbers come from the tool result.
 */
async function run(c: EvalCase, caption = c.caption) {
  const surface = surfaceOf({ ...c, caption });
  const model = mockModel("recorded", [
    toolCallTurn(c.tool, c.input),
    toolCallTurn("render_answer", { intent: c.intent, messages: surface }),
    textTurn("Done."),
  ]);
  const gateway = createGateway({
    model: () => model,
    connectMcp: fakeMcp({ down: ["power", "cmr"] }),
  });
  const user = { role: "user", parts: [{ type: "text", text: c.question }] };

  const first = await (await gateway.fetch(chatRequest({ messages: [user] }), env)).text();
  const toolCalls = first.split("tool-input-available").length - 1;

  const result = {
    role: "assistant",
    parts: [
      {
        type: `tool-${c.tool}`,
        toolCallId: "call-1",
        state: "output-available",
        input: c.input,
        output: c.output,
      },
    ],
  };
  const second = await (await gateway.fetch(chatRequest({ messages: [user, result] }), env)).text();
  return { first, second, toolCalls, surface };
}

describe("scripted demo questions", () => {
  it("covers ten questions with distinct layouts", () => {
    expect(EVAL_CASES).toHaveLength(10);
    expect(new Set(EVAL_CASES.map((c) => c.intent)).size).toBe(10);
  });

  for (const c of EVAL_CASES) {
    it(`${c.id}: "${c.question}"`, async () => {
      const { first, second, toolCalls, surface } = await run(c);
      // At least one tool call, and it is the recorded one.
      expect(toolCalls).toBeGreaterThanOrEqual(1);
      expect(first).toContain(c.tool);
      // The gateway accepted the answer: valid surface, grounded numbers, no retry, no fallback.
      expect(second).toContain('"status":"ok"');
      expect(second).not.toContain("VALIDATION_FAILED");
      expect(second).not.toContain("GROUNDING_FAILED");
      // And the same checks, run here on the recording itself.
      expect(validateAnswer(surface).ok).toBe(true);
      expect(checkGrounding([c.caption], [c.output]).ok).toBe(true);
    });
  }

  it("catches a caption with a number no tool returned", async () => {
    const first = EVAL_CASES[0] as EvalCase;
    const bad = "Durum wheat, Chickpea ranks first with a score of 0.91.";
    const { second } = await run(first, bad);
    expect(second).toContain("GROUNDING_FAILED");
    expect(second).not.toContain('"status":"ok"');
    expect(checkGrounding([bad], [first.output]).ok).toBe(false);
  });
});
