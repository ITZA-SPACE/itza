import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepsSummary, summaryText } from "./StepsSummary";
import type { Step } from "./steps";
import { Thinking } from "./Thinking";

const step = (over: Partial<Step> = {}): Step => ({
  id: "1",
  key: "assistant.step.compare",
  state: "done",
  count: 1,
  ...over,
});

describe("summaryText", () => {
  it("names the time and the steps, singular and plural", () => {
    expect(summaryText(3, 6)).toBe("Worked for 6 s in 3 steps.");
    expect(summaryText(1, 6)).toBe("Worked for 6 s in 1 step.");
    expect(summaryText(3, undefined)).toBe("Worked in 3 steps.");
    expect(summaryText(1, undefined)).toBe("Worked in 1 step.");
  });
});

describe("StepsSummary", () => {
  it("is folded by default with the steps behind a button", () => {
    const html = renderToStaticMarkup(
      createElement(StepsSummary, {
        steps: [
          step({ detail: "Compared 3 rotations" }),
          step({ id: "2", key: "assistant.step.replay" }),
        ],
        seconds: 4,
      }),
    );
    // The design system's Disclosure is a native <details>: closed unless it has the open attribute.
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Worked for 4 s in 2 steps.");
    expect(html).toContain("Compared 3 rotations");
  });

  it("renders nothing when no tool ran", () => {
    expect(renderToStaticMarkup(createElement(StepsSummary, { steps: [] }))).toBe("");
  });

  it("shows a count for merged calls and marks an error step", () => {
    const html = renderToStaticMarkup(
      createElement(StepsSummary, {
        steps: [step({ count: 3 }), step({ id: "e", state: "error" })],
      }),
    );
    expect(html).toContain("×3");
    expect(html).toContain("text-risk-ink");
  });
});

describe("Thinking checklist", () => {
  it("lists finished steps under the current one and leaves out the running one", () => {
    const html = renderToStaticMarkup(
      createElement(Thinking, {
        step: "assistant.step.replay",
        steps: [
          step({ detail: "Compared 3 rotations" }),
          step({ id: "2", key: "assistant.step.replay", state: "running" }),
        ],
      }),
    );
    expect(html).toContain("Replaying past seasons");
    expect(html).toContain('data-testid="finished-steps"');
    expect(html).toContain("Compared 3 rotations");
    expect(html.match(/<li /g)).toHaveLength(1);
  });

  it("shows no checklist before the first step finishes", () => {
    const html = renderToStaticMarkup(
      createElement(Thinking, { step: "assistant.status.thinking" }),
    );
    expect(html).not.toContain("finished-steps");
  });
});
