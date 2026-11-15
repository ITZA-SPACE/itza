import { describe, expect, it } from "vitest";
import {
  distanceFromBottom,
  FOLLOW_SLACK_PX,
  nextAnchor,
  shouldFollow,
  stuckAfterScroll,
} from "./scroll";

describe("scroll rules", () => {
  it("measures the distance from the bottom, never below zero", () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 300 })).toBe(100);
    expect(distanceFromBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 300 })).toBe(0);
    expect(distanceFromBottom({ scrollHeight: 300, scrollTop: 50, clientHeight: 300 })).toBe(0);
  });

  it("stays stuck near the bottom and lets go when the reader scrolls up", () => {
    expect(stuckAfterScroll(0)).toBe(true);
    expect(stuckAfterScroll(FOLLOW_SLACK_PX)).toBe(true);
    expect(stuckAfterScroll(FOLLOW_SLACK_PX + 1)).toBe(false);
  });

  it("follows new content only while stuck", () => {
    expect(shouldFollow(true, 0)).toBe(true);
    expect(shouldFollow(false, 0)).toBe(false);
    expect(shouldFollow(true, 5000)).toBe(false);
  });

  it("picks the anchor for each state", () => {
    expect(nextAnchor({ lastRole: "user", waiting: false, hasAnswer: false })).toBe("bottom");
    expect(nextAnchor({ lastRole: "assistant", waiting: true, hasAnswer: false })).toBe("bottom");
    expect(nextAnchor({ lastRole: "assistant", waiting: false, hasAnswer: true })).toBe(
      "answer-top",
    );
    expect(nextAnchor({ lastRole: "assistant", waiting: false, hasAnswer: false })).toBe("none");
    expect(nextAnchor({ lastRole: undefined, waiting: false, hasAnswer: false })).toBe("none");
  });
});
