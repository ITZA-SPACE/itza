import { Skeleton } from "@itza/ui-kit";
import {
  type A2uiMessage,
  detectLanguage,
  FALLBACK_CAPTION_KEYS,
  fallbackSurface,
  INTENT_CLASSES,
  type IntentClass,
  validateAnswer,
} from "@itza/ui-kit/catalog";
import { AnswerSurface } from "@itza/ui-kit/catalog/react";
import type { UIMessage } from "ai";
import { useMemo, useRef, useState } from "react";
import { type CopyKey, t } from "../copy";
import { answerDataOf } from "./answerData";
import { useAssistantActions } from "./context";
import { makeHost } from "./host";
import { localeOf, tl } from "./locale";
import { questionOf, type ToolPartInfo, turnToolParts } from "./parts";
import { surfaceFromInput } from "./surface";
import { useViewStore } from "./viewStore";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The layout that suits what the turn looked up, for when the model's own surface cannot be shown. */
function inferIntent(parts: readonly ToolPartInfo[], given: unknown): IntentClass {
  if ((INTENT_CLASSES as readonly unknown[]).includes(given)) return given as IntentClass;
  for (const part of [...parts].reverse()) {
    switch (part.name) {
      case "compare_rotations":
        return "compare_rotations";
      case "run_backtest":
        return "season_replay";
      case "get_season":
        return "season_snapshot";
      case "get_field_summary":
        return "climate_context";
      case "set_priorities":
      case "set_constraints":
        return "confirm_settings";
      case "define_term":
        return "define_term";
    }
  }
  return "general";
}

function fallbackOptions(parts: readonly ToolPartInfo[], intent: IntentClass) {
  const last = [...parts].reverse().find((p) => p.name === "get_season");
  const out = isObject(last?.output) ? last.output : undefined;
  const year = Number(String(out?.season ?? "").slice(0, 4));
  return {
    ...(intent === "season_snapshot" && Number.isInteger(year) ? { year } : {}),
    ...(intent === "confirm_settings"
      ? {
          kind: parts.some((p) => p.name === "set_constraints")
            ? ("constraints" as const)
            : ("priorities" as const),
        }
      : {}),
  };
}

function Skel() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{t("assistant.answer.skeleton")}</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
    </div>
  );
}

/** Keeps the previous data object while its values are unchanged, so the surface is not rewritten. */
function useStable(data: Record<string, unknown>): Record<string, unknown> {
  const previous = useRef<Record<string, unknown> | null>(null);
  const same = (a: unknown, b: unknown) =>
    a === b || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
  const prev = previous.current;
  if (
    prev &&
    Object.keys(prev).length === Object.keys(data).length &&
    Object.keys(data).every((key) => same(prev[key], data[key]))
  ) {
    return prev;
  }
  previous.current = data;
  return data;
}

export interface AnswerViewProps {
  part: ToolPartInfo;
  message: UIMessage;
  index: number;
  messages: readonly UIMessage[];
  /** The chat has finished with this message, so a part still waiting for a result never will get one. */
  settled: boolean;
}

/**
 * One `render_answer` call as a surface: skeleton while it streams, the model's surface once it
 * passed both the gateway's and this client's catalog checks, otherwise the predefined layout.
 */
export function AnswerView({ part, message, index, messages, settled }: AnswerViewProps) {
  const { runChip } = useAssistantActions();
  const byCall = useViewStore((s) => s.byCall);
  const override = useViewStore((s) => s.overrides[message.id]);
  const [chip, setChip] = useState<"idle" | "running" | "notFound" | "error">("idle");

  const answerData = answerDataOf(messages, index, byCall, override);
  const answer = useStable(answerData.data);
  const host = useMemo(
    () =>
      makeHost((action) => {
        setChip("running");
        runChip(action, message.id)
          .then((outcome) => setChip(outcome === "ok" ? "idle" : "notFound"))
          .catch(() => setChip("error"));
      }),
    [runChip, message.id],
  );

  const input = isObject(part.input) ? part.input : undefined;
  const output = isObject(part.output) ? part.output : undefined;
  const status = typeof output?.status === "string" ? output.status : null;

  const surface = useMemo<A2uiMessage[] | null>(() => {
    if (status !== "ok" || !input) return null;
    return surfaceFromInput(input);
  }, [status, input]);

  const waiting = part.state !== "output-available" && part.state !== "output-error" && !settled;
  const retrying = status === "error" && !settled;
  if (waiting || retrying) return <Skel />;

  let messagesToShow = surface;
  if (!messagesToShow) {
    const parts = turnToolParts(messages, index);
    const intent = inferIntent(parts, input?.intent);
    const locale = localeOf(detectLanguage(questionOf(messages, index)));
    messagesToShow = fallbackSurface(
      intent,
      tl(locale, FALLBACK_CAPTION_KEYS[intent] as CopyKey),
      fallbackOptions(parts, intent),
    );
  }
  return (
    <div className="space-y-2">
      <AnswerSurface messages={messagesToShow} data={answer} host={host} />
      <p role="status" aria-live="polite" className="text-caption text-ink-muted">
        {chip === "running" ? t("assistant.status.tool") : null}
        {chip === "notFound" ? t("assistant.chip.notFound") : null}
        {chip === "error" ? t("assistant.error.generic") : null}
      </p>
    </div>
  );
}
