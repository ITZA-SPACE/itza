import type { useChat } from "@ai-sdk/react";
import { Button, Dialog, Disclaimer, Tabs, TabsContent, TabsList, TabsTrigger } from "@itza/ui-kit";
import { checkGrounding } from "@itza/ui-kit/catalog";
import type { UIMessage } from "ai";
import { type FormEvent, Fragment, useEffect, useId, useRef, useState } from "react";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import { AnswerView } from "./AnswerView";
import { splitLeakedCall } from "./leak";
import { PinnedAnswers } from "./PinnedAnswers";
import { type ToolPartInfo, toolPartInfo, turnToolParts } from "./parts";
import { usePins } from "./pins";
import { suggestionsFor } from "./suggestions";
import { surfaceFromInput } from "./surface";
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
            ? "max-w-[85%] rounded-card bg-accent-soft p-3 text-body text-accent-strong"
            : "w-full space-y-3"
        }
      >
        <p className="sr-only">{user ? t("assistant.role.user") : t("assistant.role.assistant")}</p>
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
                        settled={settled || index < messages.length - 1}
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
  pathname,
  onAsk,
  working,
}: {
  chat: Chat;
  pathname: string;
  /** Sends a question: to the language model, or to the templates when it is not available. */
  onAsk: (question: string) => void;
  /** A template answer is being built. */
  working: boolean;
}) {
  const open = useAssistantUi((s) => s.open);
  const setOpen = useAssistantUi((s) => s.setOpen);
  const inputId = useId();
  const pinCount = usePins((s) => s.pins.length);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = working || chat.status === "submitted" || chat.status === "streaming";

  useEffect(() => {
    // After Radix has placed focus, so the question can be typed at once.
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  const lastId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    // A new message opens at its top and stays there while it fills in, until the reader scrolls.
    if (!open || !lastId) return;
    const list = listRef.current;
    const message = list?.querySelector<HTMLElement>(`[data-message-id="${lastId}"]`);
    if (!list || !message) return;
    const place = () => {
      list.scrollTop = message.offsetTop;
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
  }, [open, lastId]);

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

  return (
    <Dialog
      variant="drawer"
      open={open}
      onOpenChange={setOpen}
      title={t("assistant.title")}
      closeLabel={t("assistant.close")}
    >
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={t("assistant.title")}>
          <TabsTrigger value="chat">{t("assistant.tab.chat")}</TabsTrigger>
          <TabsTrigger value="pinned">
            {fmt(t("assistant.tab.pinned"), { count: pinCount })}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          forceMount
          className="flex min-h-0 flex-1 flex-col gap-3 data-[state=inactive]:hidden"
        >
          <section
            ref={listRef}
            className="relative min-h-0 flex-1 space-y-4 overflow-y-auto"
            aria-label={t("assistant.title")}
          >
            {chat.messages.length === 0 ? (
              <p className="text-body text-ink-muted">{t("assistant.intro")}</p>
            ) : null}
            {chat.messages.length === 0 ? (
              <section className="space-y-2" aria-label={t("assistant.suggestions")}>
                <h3 className="text-body font-semibold text-ink">{t("assistant.suggestions")}</h3>
                <ul className="flex flex-col gap-2">
                  {suggestionsFor(pathname).map((question) => (
                    <li key={question}>
                      <Button
                        variant="secondary"
                        className="h-auto min-h-11 w-full justify-start py-2 text-left"
                        onClick={() => ask(question)}
                        disabled={busy}
                      >
                        {question}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <Messages chat={chat} />
            )}
            {error ? (
              <div role="alert" className="space-y-2 rounded-control bg-risk-soft p-3">
                <p className="text-body text-risk-ink">{error}</p>
                {lastQuestion && !busy ? (
                  <Button type="button" variant="secondary" onClick={() => ask(lastQuestion)}>
                    {t("assistant.retry")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
          <p role="status" aria-live="polite" className="min-h-5 text-caption text-ink-muted">
            {statusOf(chat, working)}
          </p>
          <Disclaimer>{t("assistant.review")}</Disclaimer>
          <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <label htmlFor={inputId} className="text-body font-medium text-ink">
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
              rows={2}
              maxLength={500}
              placeholder={t("assistant.input.placeholder")}
              className="w-full resize-none rounded-control border border-line bg-surface p-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || text.trim() === ""}>
                {t("assistant.send")}
              </Button>
              {busy ? (
                <Button type="button" variant="secondary" onClick={() => void chat.stop()}>
                  {t("assistant.stop")}
                </Button>
              ) : null}
              {chat.messages.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    chat.setMessages([]);
                    useViewStore.getState().reset();
                  }}
                >
                  {t("assistant.reset")}
                </Button>
              ) : null}
            </div>
          </form>
        </TabsContent>
        <TabsContent value="pinned" className="flex min-h-0 flex-1 flex-col">
          <PinnedAnswers />
        </TabsContent>
      </Tabs>
    </Dialog>
  );
}

export type { CopyKey };
