import { loadPack } from "@itza/knowledge";
import { Skeleton } from "@itza/ui-kit";
import type { A2uiMessage } from "@itza/ui-kit/catalog";
import { AnswerSurface } from "@itza/ui-kit/catalog/react";
import { useEffect, useMemo, useState } from "react";
import { answerDataOf } from "../assistant/answerData";
import { useCompareBridge } from "../assistant/bridge";
import { makeHost } from "../assistant/host";
import { answerOffline, userMessage } from "../assistant/templates";
import type { ToolDeps } from "../assistant/tools";
import { useViewStore } from "../assistant/viewStore";
import { engine } from "../compare/engine";
import { t } from "../copy";
import { heroIdFor } from "../data";
import { fetchProjection } from "../future/useFuture";
import { useFieldStore } from "../state";

const noop = () => undefined;

/**
 * The scripted assistant turn (DEMO_STRATEGY.md §3, 1:20–1:40): runs the same offline template path
 * as a real "no network" answer, so the surface, data and sources are genuinely computed from the
 * field, never hardcoded. There is no action chip offering a specific crop swap (the template
 * builder does not generate one for any intent); a presenter who wants that moment live can open the
 * real assistant panel and ask a follow-up.
 */
export function ScriptedAnswer({ question }: { question: string }) {
  const ready = useCompareBridge();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [surface, setSurface] = useState<A2uiMessage[] | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});

  const deps = useMemo<ToolDeps>(
    () => ({
      ready,
      engine,
      projection: async () => {
        const field = useFieldStore.getState().field;
        if (!field) throw new Error("no field");
        return fetchProjection(
          heroIdFor(field.geometry),
          field.centroid,
          new AbortController().signal,
        );
      },
      field: () => useFieldStore.getState().field,
      navigate: noop,
      crops: (packId) =>
        loadPack(packId)
          .crops.filter((c) => c.kind === "crop")
          .map((c) => ({ id: c.id, name: c.name })),
    }),
    [ready],
  );

  useEffect(() => {
    let current = true;
    setState("loading");
    void answerOffline(question, deps).then((answer) => {
      if (!current) return;
      const renderAnswer = answer.parts.find((p) => p.type === "tool-render_answer");
      const input =
        renderAnswer && "input" in renderAnswer
          ? (renderAnswer.input as { messages?: unknown })
          : null;
      const messages = Array.isArray(input?.messages) ? (input.messages as A2uiMessage[]) : null;
      if (!messages) {
        setState("error");
        return;
      }
      const transcript = [userMessage(question), answer];
      const { data: answerData } = answerDataOf(
        transcript,
        1,
        useViewStore.getState().byCall,
        undefined,
      );
      setSurface(messages);
      setData(answerData);
      setState("ready");
    });
    return () => {
      current = false;
    };
  }, [question, deps]);

  if (state === "loading") {
    return (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t("demo.assistant.loading")}</span>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (state === "error" || !surface) {
    return <p role="alert">{t("demo.assistant.error")}</p>;
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <AnswerSurface messages={surface} data={data} host={makeHost(noop)} />
    </div>
  );
}
