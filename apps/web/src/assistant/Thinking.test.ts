import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "../copy";
import type { Step } from "./steps";
import { Thinking } from "./Thinking";

const html = (step: Parameters<typeof Thinking>[0]["step"]) =>
  renderToStaticMarkup(createElement(Thinking, { step }));

describe("Thinking", () => {
  it("shows the step, is hidden from assistive technology and has the animated parts", () => {
    const markup = html("assistant.step.compare");
    expect(markup).toContain(t("assistant.step.compare"));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("animate-spin");
    expect(markup.match(/animate-bounce/g)).toHaveLength(3);
  });

  it("only animates when motion is allowed", () => {
    const markup = html("assistant.status.thinking");
    expect(markup).not.toMatch(/(?<!motion-safe:)animate-spin/);
    expect(markup).not.toMatch(/(?<!motion-safe:)animate-bounce/);
    expect(markup).toContain("motion-reduce:transition-none");
  });

  it("does not show the slow-data hint straight away", () => {
    expect(html("assistant.step.power")).not.toContain(t("assistant.step.slow"));
  });
});

const stepOf = (over: Partial<Step> = {}): Step => ({
  id: "1",
  key: "assistant.step.compare",
  state: "done",
  count: 1,
  ...over,
});
describe("Thinking checklist", () => {
  it("lists finished steps under the current one and leaves out the running one", () => {
    const html = renderToStaticMarkup(
      createElement(Thinking, {
        step: "assistant.step.replay",
        steps: [
          stepOf({ detail: "Compared 3 rotations" }),
          stepOf({ id: "2", key: "assistant.step.replay", state: "running" }),
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
