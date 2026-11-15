import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { phaseOf, stepOfTool } from "./phase";

const assistant = (parts: unknown[]): UIMessage =>
  ({ id: "a", role: "assistant", parts }) as unknown as UIMessage;
const user: UIMessage = { id: "u", role: "user", parts: [{ type: "text", text: "hi" }] };

describe("stepOfTool", () => {
  it("names each browser tool, the NASA servers and the answer", () => {
    expect(stepOfTool("get_field_summary")).toBe("assistant.step.field");
    expect(stepOfTool("compare_rotations")).toBe("assistant.step.compare");
    expect(stepOfTool("run_backtest")).toBe("assistant.step.replay");
    expect(stepOfTool("power_get_daily_data")).toBe("assistant.step.power");
    expect(stepOfTool("cmr_search_granules")).toBe("assistant.step.cmr");
    expect(stepOfTool("render_answer")).toBe("assistant.step.answer");
    expect(stepOfTool("something_new")).toBe("assistant.step.work");
  });
});

describe("phaseOf", () => {
  it("is nothing when the chat is idle or has failed", () => {
    expect(phaseOf("ready", [user], false)).toBeNull();
    expect(phaseOf("error", [user], false)).toBeNull();
  });

  it("is thinking from the moment a question is sent until the first reply part", () => {
    expect(phaseOf("submitted", [user], false)?.key).toBe("assistant.status.thinking");
    expect(phaseOf("streaming", [user], false)?.key).toBe("assistant.status.thinking");
    expect(phaseOf("streaming", [user, assistant([])], false)?.key).toBe(
      "assistant.status.thinking",
    );
    expect(
      phaseOf("streaming", [user, assistant([{ type: "text", text: "  " }])], false)?.key,
    ).toBe("assistant.status.thinking");
  });

  it("names the tool that has not returned yet", () => {
    const running = assistant([
      { type: "tool-compare_rotations", toolCallId: "1", state: "input-available", input: {} },
    ]);
    expect(phaseOf("streaming", [user, running], false)?.key).toBe("assistant.step.compare");
    const power = assistant([
      { type: "tool-power_get_daily_data", toolCallId: "2", state: "input-streaming" },
    ]);
    expect(phaseOf("streaming", [user, power], false)?.key).toBe("assistant.step.power");
    const building = assistant([
      { type: "tool-render_answer", toolCallId: "3", state: "input-streaming" },
    ]);
    expect(phaseOf("streaming", [user, building], false)?.key).toBe("assistant.step.answer");
  });

  it("shows nothing while plain text streams in, because the text is the progress", () => {
    expect(
      phaseOf("streaming", [user, assistant([{ type: "text", text: "Salam, labas!" }])], false),
    ).toBeNull();
  });

  it("shows nothing once every tool has returned and the answer is visible", () => {
    const done = assistant([
      {
        type: "tool-compare_rotations",
        toolCallId: "1",
        state: "output-available",
        input: {},
        output: {},
      },
    ]);
    expect(phaseOf("streaming", [user, done], false)).toBeNull();
  });

  it("reports the template answer being built", () => {
    expect(phaseOf("ready", [], true)?.key).toBe("assistant.step.field");
  });
});
