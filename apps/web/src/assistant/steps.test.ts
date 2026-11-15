import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { MAX_STEPS, stepsOf } from "./steps";

const message = (parts: unknown[]) =>
  ({ id: "a", role: "assistant", parts }) as unknown as UIMessage;
const tool = (name: string, state: string, id = name) => ({
  type: `tool-${name}`,
  toolCallId: id,
  state,
});
const byCall = {
  c1: { tool: "compare_rotations", summary: "Compared 3 rotations", view: {}, sources: [] },
};

describe("stepsOf", () => {
  it("has no steps for a text reply", () => {
    expect(stepsOf(message([{ type: "text", text: "Salam" }]), {})).toEqual([]);
  });

  it("shows a running tool without detail and a finished one with its summary", () => {
    const steps = stepsOf(
      message([
        tool("compare_rotations", "output-available", "c1"),
        tool("run_backtest", "input-available"),
      ]),
      byCall,
    );
    expect(steps.map((s) => [s.key, s.state, s.detail])).toEqual([
      ["assistant.step.compare", "done", "Compared 3 rotations"],
      ["assistant.step.replay", "running", undefined],
    ]);
  });

  it("marks a failed tool and merges repeated calls with a count", () => {
    const steps = stepsOf(
      message([
        tool("get_season", "output-available", "s1"),
        tool("get_season", "output-error", "s2"),
        tool("get_season", "output-available", "s3"),
      ]),
      {},
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ count: 3, state: "error" });
  });

  it("shows the answer only while it is being drawn", () => {
    expect(stepsOf(message([tool("render_answer", "input-streaming")]), {})[0]?.key).toBe(
      "assistant.step.answer",
    );
    expect(stepsOf(message([tool("render_answer", "output-available")]), {})).toEqual([]);
  });

  it("keeps at most six lines, the newest", () => {
    const names = [
      "get_field_summary",
      "compare_rotations",
      "run_backtest",
      "get_season",
      "explain_exclusion",
      "define_term",
      "navigate",
    ];
    const steps = stepsOf(message(names.map((n) => tool(n, "output-available"))), {});
    expect(steps).toHaveLength(MAX_STEPS);
    expect(steps[steps.length - 1]?.key).toBe("assistant.step.navigate");
  });
});
