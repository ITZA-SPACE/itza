/** Pure rules for following the assistant while it works; the panel only connects them to the DOM. */

/** How far from the bottom the reader may be and still count as following along. */
export const FOLLOW_SLACK_PX = 80;

export function distanceFromBottom(el: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

/** Keep the newest content in view only while the reader has not scrolled up to read something else. */
export function shouldFollow(stuck: boolean, distance: number): boolean {
  return stuck && distance <= FOLLOW_SLACK_PX * 4;
}

/** Whether a user scroll leaves the reader at the bottom (still following) or away from it. */
export function stuckAfterScroll(distance: number): boolean {
  return distance <= FOLLOW_SLACK_PX;
}

export type Anchor = "bottom" | "answer-top" | "none";

/**
 * Where the view should be: at the bottom while the assistant is working or the newest message is
 * the user's, at the top of the answer once reply content exists, otherwise left alone.
 */
export function nextAnchor(state: {
  lastRole: string | undefined;
  waiting: boolean;
  hasAnswer: boolean;
}): Anchor {
  if (state.waiting || state.lastRole === "user") return "bottom";
  if (state.lastRole === "assistant" && state.hasAnswer) return "answer-top";
  return "none";
}
