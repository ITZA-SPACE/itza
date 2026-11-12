import type { useChat } from "@ai-sdk/react";
import { Button, Dialog, Disclaimer } from "@itza/ui-kit";
import type { UIMessage } from "ai";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { type CopyKey, t } from "../copy";
import { AnswerView } from "./AnswerView";
import { toolPartInfo } from "./parts";
import { suggestionsFor } from "./suggestions";
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
                  <p key={i} className="whitespace-pre-wrap text-body text-ink">
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

function statusOf(chat: Chat): string {
  const last = chat.messages[chat.messages.length - 1];
  if (chat.status === "submitted") return t("assistant.status.thinking");
  if (chat.status !== "streaming") return "";
  const running = last?.parts.some((part) => {
    const info = toolPartInfo(part);
    return info && info.name !== "render_answer" && info.state !== "output-available";
  });
  return running ? t("assistant.status.tool") : t("assistant.status.building");
}

export function AssistantPanel({ chat, pathname }: { chat: Chat; pathname: string }) {
  const open = useAssistantUi((s) => s.open);
  const setOpen = useAssistantUi((s) => s.setOpen);
  const inputId = useId();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";

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
    void chat.sendMessage({ text: clean });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(text);
  };
  const error = errorText(chat.error);

  return (
    <Dialog
      variant="drawer"
      open={open}
      onOpenChange={setOpen}
      title={t("assistant.title")}
      closeLabel={t("assistant.close")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
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
            <p role="alert" className="rounded-control bg-risk-soft p-3 text-body text-risk-ink">
              {error}
            </p>
          ) : null}
        </section>
        <p role="status" aria-live="polite" className="min-h-5 text-caption text-ink-muted">
          {statusOf(chat)}
        </p>
        <Disclaimer>{t("assistant.review")}</Disclaimer>
        <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <label htmlFor={inputId} className="text-body font-medium text-ink">
            {t("assistant.input.label")}
          </label>
          <textarea
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
      </div>
    </Dialog>
  );
}

export type { CopyKey };
