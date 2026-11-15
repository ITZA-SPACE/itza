import type { useChat } from "@ai-sdk/react";
import {
  cn,
  Disclaimer,
  focusRing,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@itza/ui-kit";
import { checkGrounding } from "@itza/ui-kit/catalog";
import type { UIMessage } from "ai";
import { ArrowDown, ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { type FormEvent, Fragment, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import { AnswerView } from "./AnswerView";
import { splitLeakedCall } from "./leak";
import { PinnedAnswers } from "./PinnedAnswers";
import { type ToolPartInfo, toolPartInfo, turnToolParts } from "./parts";
import { phaseOf } from "./phase";
import { usePins } from "./pins";
import { StepsSummary } from "./StepsSummary";
import { stepsOf } from "./steps";
import { suggestions } from "./suggestions";
import { localizedSuggestions } from "./suggestionsLocale";
import { surfaceFromInput } from "./surface";
import { Thinking } from "./Thinking";
import { useAssistantUi } from "./ui";
import { useFollow } from "./useFollow";
import { useViewStore } from "./viewStore";

type Chat = ReturnType<typeof useChat>;

/** The gateway answers with a small JSON body when it refuses; turn it into plain advice. */
function errorText(error: Error | undefined): string | null {
  if (!error) return null;
  let code = "";
  try {
    const body = JSON.parse(error.message) as { error?: string };
    code = body.error ?? "";
  } catch {
    // Not JSON: a network failure or a stream error.
  }
  if (code === "no_provider" || code === "budget_exhausted") return t("assistant.error.templates");
  if (code === "rate_limited") return t("assistant.error.busy");
  return t("assistant.error.generic");
}

function Bubble({ message, children }: { message: UIMessage; children: React.ReactNode }) {
  const user = message.role === "user";
  return (
    <li data-message-id={message.id} className={user ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          user
            ? "max-w-[85%] rounded-[1.25rem] rounded-br-md border border-rain/50 bg-space/20 px-4 py-2.5 text-body text-ink [overflow-wrap:anywhere]"
            : "w-full min-w-0 space-y-3 [overflow-wrap:anywhere]"
        }
      >
        {user ? (
          <p className="sr-only">{t("assistant.role.user")}</p>
        ) : (
          <p className="flex items-center gap-2 font-display font-bold text-ink">
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full border border-rim bg-glass text-rain"
            >
              <Sparkles className="size-4" />
            </span>
            {t("nav.assistant")}
          </p>
        )}
        {children}
      </div>
    </li>
  );
}

/** The answer call a model printed as text, as a tool part, when it can be trusted. */
function leakedAnswer(
  message: UIMessage,
  call: Record<string, unknown>,
  messages: readonly UIMessage[],
  index: number,
  partIndex: number,
): ToolPartInfo | null {
  if (surfaceFromInput(call) === null) return null;
  const outputs = turnToolParts(messages, index)
    .filter((p) => p.name !== "render_answer" && p.state === "output-available")
    .map((p) => p.output);
  const texts = typeof call.caption === "string" ? [call.caption] : [];
  if (!checkGrounding(texts, outputs).ok) return null;
  return {
    name: "render_answer",
    toolCallId: `${message.id}:leaked:${partIndex}`,
    state: "output-available",
    input: call,
    output: { status: "ok" },
  };
}

function Messages({ chat, durations }: { chat: Chat; durations: Record<string, number> }) {
  const { messages, status } = chat;
  const settled = status === "ready" || status === "error";
  const byCall = useViewStore((s) => s.byCall);
  return (
    <ol className="space-y-4">
      {messages.map((message, index) => {
        const renders = message.parts
          .map((part) => toolPartInfo(part))
          .filter((info) => info?.name === "render_answer");
        const lastRender = renders[renders.length - 1];
        const done = settled || index < messages.length - 1;
        return (
          <Bubble key={message.id} message={message}>
            {message.role === "assistant" && done ? (
              <StepsSummary steps={stepsOf(message, byCall)} seconds={durations[message.id]} />
            ) : null}
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                // A model may print its answer call as text: hide it, and draw the answer from it
                // when it is complete, valid and grounded, unless the message has a real one.
                const { text, call } = splitLeakedCall(part.text);
                const leaked =
                  message.role === "assistant" && renders.length === 0 && call
                    ? leakedAnswer(message, call, messages, index, i)
                    : null;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
                  <Fragment key={i}>
                    {text.trim() ? (
                      <p dir="auto" className="whitespace-pre-wrap text-body text-ink">
                        {text}
                      </p>
                    ) : null}
                    {leaked ? (
                      <AnswerView
                        part={leaked}
                        message={message}
                        index={index}
                        messages={messages}
                        settled={done}
                      />
                    ) : null}
                  </Fragment>
                );
              }
              const info = toolPartInfo(part);
              if (info?.name !== "render_answer" || info.toolCallId !== lastRender?.toolCallId)
                return null;
              return (
                <AnswerView
                  key={info.toolCallId}
                  part={info}
                  message={message}
                  index={index}
                  messages={messages}
                  settled={done}
                />
              );
            })}
          </Bubble>
        );
      })}
    </ol>
  );
}

export function AssistantPanel({
  chat,
  onAsk,
  working,
}: {
  chat: Chat;
  /** Sends a question: to the language model, or to the templates when it is not available. */
  onAsk: (question: string) => void;
  /** A template answer is being built. */
  working: boolean;
}) {
  const slot = useAssistantUi((s) => s.slot);
  const inputId = useId();
  const pinCount = usePins((s) => s.pins.length);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = working || chat.status === "submitted" || chat.status === "streaming";
  const shown = slot !== null;

  useEffect(() => {
    // Ready to type on arrival, except on touch screens, where the keyboard would cover the page.
    if (!shown || window.matchMedia("(pointer: coarse)").matches) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [shown]);

  const phase = phaseOf(chat.status, chat.messages, working);
  const byCall = useViewStore((st) => st.byCall);
  const lastMessage = chat.messages[chat.messages.length - 1];
  const liveSteps = phase && lastMessage?.role === "assistant" ? stepsOf(lastMessage, byCall) : [];
  const { away, jump } = useFollow(listRef, shown, chat.messages, phase !== null, liveSteps.length);

  // How long each answer took, for the folded "Worked for 6 s" line; kept while the page is open.
  const wasBusy = useRef(false);
  const startedAt = useRef(0);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const lastMessageId = lastMessage?.id;
  useEffect(() => {
    if (!wasBusy.current && busy) startedAt.current = Date.now();
    if (wasBusy.current && !busy) {
      // The cursor goes back to the box, except on touch screens, where it would raise the keyboard.
      if (shown && !window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus();
      const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      if (lastMessageId) setDurations((d) => ({ ...d, [lastMessageId]: seconds }));
    }
    wasBusy.current = busy;
  }, [busy, shown, lastMessageId]);

  if (!slot) return null;

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean || busy) return;
    setText("");
    onAsk(clean);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(text);
  };
  const error = errorText(chat.error);
  const lastQuestion = [...chat.messages]
    .reverse()
    .find((m) => m.role === "user")
    ?.parts.map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  const empty = chat.messages.length === 0;

  return createPortal(
    <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col px-4 pt-3">
      <header className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.75rem] leading-9 font-bold text-ink sm:text-display">
            {t("nav.assistant")}
          </h1>
          <p className="truncate text-caption text-ink-muted sm:text-[0.9375rem]">
            {t("assistant.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {empty ? null : (
            <IconButton
              label={t("assistant.reset")}
              disabled={busy}
              onClick={() => {
                chat.setMessages([]);
                useViewStore.getState().reset();
              }}
            >
              <RotateCcw aria-hidden />
            </IconButton>
          )}
          <TabsList aria-label={t("nav.assistant")}>
            <TabsTrigger value="chat">{t("assistant.tab.chat")}</TabsTrigger>
            <TabsTrigger value="pinned">
              {fmt(t("assistant.tab.pinned"), { count: pinCount })}
            </TabsTrigger>
          </TabsList>
        </div>
      </header>
      <TabsContent
        value="chat"
        forceMount
        className="flex min-h-0 flex-1 flex-col pt-0 data-[state=inactive]:hidden"
      >
        <section
          ref={listRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
          aria-label={t("assistant.conversation")}
        >
          {empty ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 py-8 text-center">
              <p className="max-w-md text-body text-ink-muted">{t("assistant.intro")}</p>
            </div>
          ) : (
            <Messages chat={chat} durations={durations} />
          )}
          {phase ? (
            <div className="mt-4">
              <Thinking step={phase.key} steps={liveSteps} />
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="mt-4 space-y-2 rounded-panel border border-risk-ink/40 bg-risk-soft px-4 py-3"
            >
              <p className="text-body text-risk-ink">{error}</p>
              {lastQuestion && !busy ? (
                <button
                  type="button"
                  onClick={() => ask(lastQuestion)}
                  className={cn(
                    "glass-control min-h-10 rounded-full px-4 text-caption font-semibold text-ink hover:bg-glass-strong",
                    focusRing,
                  )}
                >
                  {t("assistant.retry")}
                </button>
              ) : null}
            </div>
          ) : null}
          {away ? (
            <div className="sticky bottom-2 mt-3 flex justify-center">
              <button
                type="button"
                onClick={jump}
                className={cn(
                  "glass-control inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-caption font-semibold text-ink shadow-glass hover:bg-glass-strong",
                  focusRing,
                )}
              >
                <ArrowDown aria-hidden className="size-4" />
                {t("assistant.jump")}
              </button>
            </div>
          ) : null}
        </section>
        <div className="shrink-0 space-y-2 pb-2">
          {empty ? (
            <ul
              aria-label={t("assistant.suggestions")}
              className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {localizedSuggestions(suggestions()).map((question) => (
                <li key={question} className="shrink-0 snap-start">
                  <button
                    type="button"
                    dir="auto"
                    onClick={() => ask(question)}
                    disabled={busy}
                    className={cn(
                      "glass-control min-h-10 rounded-full px-4 text-caption font-semibold text-ink hover:bg-glass-strong disabled:opacity-40",
                      focusRing,
                    )}
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p role="status" aria-live="polite" className="sr-only">
            {phase ? `${t(phase.key)}…` : ""}
          </p>
          <form
            onSubmit={submit}
            className="glass-panel flex items-end gap-2 rounded-[1.75rem] py-1.5 pr-1.5 pl-5 focus-within:border-space"
          >
            <label htmlFor={inputId} className="sr-only">
              {t("assistant.input.label")}
            </label>
            <textarea
              ref={inputRef}
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(text);
                }
              }}
              rows={1}
              maxLength={500}
              enterKeyHint="send"
              placeholder={t("assistant.input.placeholder")}
              className="field-sizing-content max-h-36 min-h-11 flex-1 resize-none border-0 bg-transparent py-2.5 text-body text-ink shadow-none focus-visible:outline-none"
            />
            {busy ? (
              <IconButton label={t("assistant.stop")} onClick={() => void chat.stop()}>
                <Square aria-hidden />
              </IconButton>
            ) : (
              <IconButton
                type="submit"
                variant="primary"
                label={t("assistant.send")}
                disabled={text.trim() === ""}
              >
                <ArrowUp aria-hidden />
              </IconButton>
            )}
          </form>
          {text.length > 400 ? (
            <p className="px-2 text-right text-caption text-ink-muted" aria-live="polite">
              {text.length}/500
            </p>
          ) : null}
          <Disclaimer className="px-2 text-center">{t("assistant.review")}</Disclaimer>
        </div>
      </TabsContent>
      <TabsContent value="pinned" className="flex min-h-0 flex-1 flex-col pb-4">
        <PinnedAnswers />
      </TabsContent>
    </Tabs>,
    slot,
  );
}

export type { CopyKey };
