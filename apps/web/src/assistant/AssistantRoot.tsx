import { useChat } from "@ai-sdk/react";
import { loadPack } from "@itza/knowledge";
import { resolveAction } from "@itza/ui-kit/catalog";
import type { ChipAction } from "@itza/ui-kit/catalog/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../compare/engine";
import { heroIdFor } from "../data";
import { fetchProjection } from "../future/useFuture";
import { config } from "../lib/config";
import { useFieldStore } from "../state";
import { AssistantPanel } from "./AssistantPanel";
import { summaryOf } from "./answerData";
import { NoFieldError, useCompareBridge } from "./bridge";
import { ActionsContext, type AssistantActions } from "./context";
import { answerOffline, userMessage } from "./templates";
import { isClientTool, NAV_VIEWS, type NavView, runTool, type ToolDeps } from "./tools";
import { useAssistantUi } from "./ui";
import { useViewStore } from "./viewStore";

const SESSION_KEY = "itza:assistant:session";
const MAX_MESSAGES = 36;

const PATHS: Record<NavView, string> = {
  map: "/field",
  replay: "/compare",
  cards: "/compare",
  twin: "/twin",
  future: "/future",
  zones: "/field",
};

function sessionId(): string {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** The gateway answers a refusal with a small JSON body; `rate_limited` is the one case templates would not help. */
function isBusy(error: Error): boolean {
  try {
    return (JSON.parse(error.message) as { error?: string }).error === "rate_limited";
  } catch {
    return false;
  }
}

function lastQuestion(messages: UIMessage[] | undefined): string | null {
  const last = messages?.findLast((m) => m.role === "user");
  const text = last?.parts.find((p) => p.type === "text");
  return text && "text" in text ? text.text : null;
}

/** Last messages that fit the gateway's limit, starting at a user message so no tool call is cut off. */
function recent(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  let start = messages.length - MAX_MESSAGES;
  while (start < messages.length && messages[start]?.role !== "user") start++;
  return messages.slice(start);
}

/**
 * The assistant: chat with the gateway, browser tools run against the engine worker, and a panel
 * that is reachable from every screen. Loaded on first use; the conversation stays while the panel
 * is closed.
 */
export default function AssistantRoot() {
  const navigate = useNavigate();
  const setOpen = useAssistantUi((s) => s.setOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ready = useCompareBridge();

  const deps = useMemo<ToolDeps>(
    () => ({
      ready,
      engine,
      projection: async () => {
        const field = useFieldStore.getState().field;
        if (!field) throw new NoFieldError();
        return fetchProjection(
          heroIdFor(field.geometry),
          field.centroid,
          new AbortController().signal,
        );
      },
      field: () => useFieldStore.getState().field,
      navigate: (view) => {
        setOpen(false);
        void navigate({ to: PATHS[view] });
      },
      crops: (packId) =>
        loadPack(packId)
          .crops.filter((c) => c.kind === "crop")
          .map((c) => ({ id: c.id, name: c.name })),
    }),
    [ready, navigate, setOpen],
  );
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${config.siGatewayUrl}/chat`,
        headers: { "X-Session-Id": sessionId() },
        prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: recent(messages) } }),
      }),
    [],
  );

  const chatRef = useRef<ReturnType<typeof useChat> | null>(null);
  const [working, setWorking] = useState(false);

  /** Answers from templates when the language model cannot (no key, budget spent, offline, error). */
  const answerFromTemplates = useCallback(async (question: string, addQuestion: boolean) => {
    setWorking(true);
    try {
      const answer = await answerOffline(question, depsRef.current);
      chatRef.current?.setMessages((previous) =>
        addQuestion ? [...previous, userMessage(question), answer] : [...previous, answer],
      );
      chatRef.current?.clearError();
    } finally {
      setWorking(false);
    }
  }, []);

  const chat = useChat({
    transport,
    onError: (error) => {
      if (error.name === "AbortError" || isBusy(error)) return;
      const question = lastQuestion(chatRef.current?.messages);
      if (question) void answerFromTemplates(question, false);
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      const name = toolCall.toolName;
      if (!isClientTool(name)) return;
      const add = chatRef.current?.addToolOutput;
      try {
        const outcome = await runTool(name, toolCall.input, depsRef.current);
        useViewStore.getState().record(toolCall.toolCallId, {
          tool: name,
          summary: summaryOf(name, outcome.summaryParams),
          view: outcome.view,
          sources: outcome.sources,
        });
        add?.({ tool: name, toolCallId: toolCall.toolCallId, output: outcome.output });
      } catch (error) {
        add?.({
          state: "output-error",
          tool: name,
          toolCallId: toolCall.toolCallId,
          errorText: error instanceof Error ? error.message : "The tool failed",
        });
      }
    },
  });
  useEffect(() => {
    chatRef.current = chat;
  });

  const sendRef = useRef<(question: string) => void>(() => {});
  const actions = useMemo<AssistantActions>(
    () => ({
      runChip: async (action: ChipAction, messageId: string) => {
        const resolved = resolveAction(action);
        if (!resolved) return "ok";
        if (resolved.kind === "ask") {
          // A suggested follow-up: sent as the user's next message, like a typed question. Ignored
          // while an answer is still coming, as the input box is.
          const status = chatRef.current?.status;
          if (status === "submitted" || status === "streaming") return "ok";
          sendRef.current(resolved.question);
          return "ok";
        }
        if (resolved.kind === "navigate") {
          const view = NAV_VIEWS.find((v) => v === resolved.view);
          if (view) depsRef.current.navigate(view);
          return "ok";
        }
        if (!isClientTool(resolved.tool)) return "ok";
        const outcome = await runTool(resolved.tool, resolved.args, depsRef.current);
        if (outcome.output.found === false) return "notFound";
        useViewStore.getState().override(messageId, outcome.view);
        return "ok";
      },
    }),
    [],
  );

  const take = useAssistantUi((s) => s.take);
  const queued = useAssistantUi((s) => s.queued);
  const send = useCallback(
    (question: string) => {
      // No network at all: skip the request and answer from templates at once.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        void answerFromTemplates(question, true);
        return;
      }
      void chatRef.current?.sendMessage({ text: question });
    },
    [answerFromTemplates],
  );
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (queued === null) return;
    // Taken inside the timer so a development double-run of this effect does not lose the question.
    const timer = setTimeout(() => {
      const question = take();
      if (question) sendRef.current(question);
    }, 0);
    return () => clearTimeout(timer);
  }, [queued, take]);

  return (
    <ActionsContext.Provider value={actions}>
      <AssistantPanel chat={chat} pathname={pathname} onAsk={send} working={working} />
    </ActionsContext.Provider>
  );
}
