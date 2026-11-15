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
import type { UIMessage } from "ai";
import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import { AnswerView } from "./AnswerView";
import { PinnedAnswers } from "./PinnedAnswers";
import { toolPartInfo } from "./parts";
import { usePins } from "./pins";
import { suggestions } from "./suggestions";
import { useAssistantUi } from "./ui";
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

function Messages({ chat }: { chat: Chat }) {
  const { messages, status } = chat;
  const settled = status === "ready" || status === "error";
  return (
    <ol className="space-y-4">
      {messages.map((message, index) => {
        const renders = message.parts
          .map((part) => toolPartInfo(part))
          .filter((info) => info?.name === "render_answer");
        const lastRender = renders[renders.length - 1];
        return (
          <Bubble key={message.id} message={message}>
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return part.text.trim() ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
                  <p key={i} dir="auto" className="whitespace-pre-wrap text-body text-ink">
                    {part.text}
                  </p>
                ) : null;
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
                  settled={settled || index < messages.length - 1}
                />
              );
            })}
          </Bubble>
        );
      })}
    </ol>
  );
}

function statusOf(chat: Chat, working: boolean): string {
  if (working) return t("assistant.status.tool");
  const last = chat.messages[chat.messages.length - 1];
  if (chat.status === "submitted") return t("assistant.status.thinking");
  if (chat.status !== "streaming") return "";
  const running = last?.parts.some((part) => {
    const info = toolPartInfo(part);
    return info && info.name !== "render_answer" && info.state !== "output-available";
  });
  return running ? t("assistant.status.tool") : t("assistant.status.building");
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

  const lastId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    // A new message opens at its top and stays there while it fills in, until the reader scrolls.
    if (!shown || !lastId) return;
    const list = listRef.current;
    const message = list?.querySelector<HTMLElement>(`[data-message-id="${lastId}"]`);
    if (!list || !message) return;
    const place = () => {
      list.scrollTop = message.offsetTop - 8;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(message);
    const stop = () => observer.disconnect();
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const event of events) list.addEventListener(event, stop, { once: true, passive: true });
    const timer = setTimeout(stop, 20_000);
    return () => {
      stop();
      clearTimeout(timer);
      for (const event of events) list.removeEventListener(event, stop);
    };
  }, [shown, lastId]);

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
  const empty = chat.messages.length === 0;
  const status = statusOf(chat, working);

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
              <span
                aria-hidden="true"
                className="inline-flex size-16 items-center justify-center rounded-full border border-rim bg-glass text-rain shadow-glass"
              >
                <Sparkles className="size-7" />
              </span>
              <p className="max-w-md text-body text-ink-muted">{t("assistant.intro")}</p>
            </div>
          ) : (
            <Messages chat={chat} />
          )}
          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-panel border border-risk-ink/40 bg-risk-soft px-4 py-3 text-body text-risk-ink"
            >
              {error}
            </p>
          ) : null}
        </section>
        <div className="shrink-0 space-y-2 pb-2">
          {empty ? (
            <ul
              aria-label={t("assistant.suggestions")}
              className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {suggestions().map((question) => (
                <li key={question} className="shrink-0 snap-start">
                  <button
                    type="button"
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
          <p role="status" aria-live="polite" className="min-h-5 px-2 text-caption text-ink-muted">
            {status}
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
