import { DATA_PATHS } from "@itza/ui-kit/catalog";
import type { UIMessage } from "ai";
import { type CopyKey, t } from "../copy";
import { turnToolParts } from "./parts";
import type { useViewStore } from "./viewStore";
import type { CallView, SourceView } from "./views";

export interface AnswerData {
  data: Record<string, unknown>;
  sources: SourceView[];
  calls: CallView[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Source named in a server tool result's provenance block (the NASA data tools). */
function serverSource(output: unknown): SourceView | null {
  if (!isObject(output) || !isObject(output.provenance)) return null;
  const { source, retrievedAt } = output.provenance;
  if (typeof source !== "string") return null;
  return {
    source,
    resolution: t("assistant.provenance.na"),
    period:
      typeof retrievedAt === "string" ? retrievedAt.slice(0, 10) : t("assistant.provenance.na"),
  };
}

/**
 * Everything the answer in message `index` binds to: the tool results of its turn, the sources
 * they name and the calls made. Numbers in components come from here, never from the model.
 */
export function answerDataOf(
  messages: readonly UIMessage[],
  index: number,
  byCall: ReturnType<typeof useViewStore.getState>["byCall"],
  override: Record<string, unknown> | undefined,
): AnswerData {
  const data: Record<string, unknown> = {};
  const sources = new Map<string, SourceView>();
  const calls: CallView[] = [];
  const addSource = (s: SourceView) => sources.set(`${s.source}|${s.resolution}|${s.period}`, s);
  for (const part of turnToolParts(messages, index)) {
    if (part.name === "render_answer" || part.state !== "output-available") continue;
    const entry = byCall[part.toolCallId];
    if (entry) {
      Object.assign(data, entry.view);
      for (const s of entry.sources) addSource(s);
      calls.push({ tool: part.name, summary: entry.summary });
      continue;
    }
    const server = serverSource(part.output);
    if (server) addSource(server);
    calls.push({ tool: part.name, summary: t("assistant.trace.summary.other") });
  }
  Object.assign(data, override);
  data[DATA_PATHS.provenance] = [...sources.values()];
  data[DATA_PATHS.trace] = calls;
  return { data, sources: [...sources.values()], calls };
}

export function summaryOf(tool: string, params: Record<string, string | number>): string {
  const key = `assistant.trace.summary.${tool}` as CopyKey;
  return t(key).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
}
