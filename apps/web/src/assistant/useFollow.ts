import type { UIMessage } from "ai";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toolPartInfo } from "./parts";
import { distanceFromBottom, nextAnchor, shouldFollow, stuckAfterScroll } from "./scroll";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps the newest thinking in view. A new turn (any source: typed, suggestion, chip, template)
 * scrolls to the bottom; while the assistant works the bottom stays in view unless the reader
 * scrolled up; when the answer arrives its first line is placed at the top once.
 */
export function useFollow(
  list: RefObject<HTMLElement | null>,
  open: boolean,
  messages: readonly UIMessage[],
  waiting: boolean,
  progress: number,
) {
  const stuck = useRef(true);
  const anchored = useRef<string | null>(null);
  const [away, setAway] = useState(false);
  const last = messages[messages.length - 1];
  const lastId = last?.id;
  const lastRole = last?.role;
  const hasAnswer =
    last?.role === "assistant" &&
    last.parts.some((part) =>
      part.type === "text"
        ? part.text.trim() !== ""
        : toolPartInfo(part)?.name === "render_answer" &&
          toolPartInfo(part)?.state === "output-available",
    );

  const toBottom = useCallback(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [list]);

  // The reader's own scrolling decides whether we keep following.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const onScroll = () => {
      stuck.current = stuckAfterScroll(distanceFromBottom(el));
      setAway(!stuck.current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [list]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `progress` re-runs the follow for each step
  useEffect(() => {
    if (!open || !lastId) return;
    const el = list.current;
    if (!el) return;
    const anchor = nextAnchor({ lastRole, waiting, hasAnswer });
    if (anchor === "bottom") {
      if (lastRole === "user") {
        stuck.current = true;
        anchored.current = null;
      }
      if (shouldFollow(stuck.current, distanceFromBottom(el)) || lastRole === "user") toBottom();
    } else if (anchor === "answer-top" && anchored.current !== lastId) {
      anchored.current = lastId;
      const message = el.querySelector<HTMLElement>(`[data-message-id="${lastId}"]`);
      if (message)
        el.scrollTo({ top: message.offsetTop - 8, behavior: reducedMotion() ? "auto" : "smooth" });
    }
    // `progress` changes whenever a step is added, so the follow runs for each one.
  }, [open, lastId, lastRole, waiting, hasAnswer, progress, list, toBottom]);

  const jump = useCallback(() => {
    stuck.current = true;
    setAway(false);
    toBottom();
  }, [toBottom]);

  return { away: away && waiting, jump };
}
