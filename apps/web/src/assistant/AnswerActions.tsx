import { Button } from "@itza/ui-kit";
import type { A2uiMessage } from "@itza/ui-kit/catalog";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { usePinnedStore } from "../report/pinnedStore";
import { useFieldStore } from "../state";
import { usePins, withoutChips } from "./pins";
import type { SourceView } from "./views";

const TITLE_MAX = 80;

/** Pin keeps the answer in the workspace; Add to card puts a short version on the printed card. */
export function AnswerActions({
  id,
  question,
  caption,
  messages,
  data,
  sources,
}: {
  id: string;
  question: string;
  caption: string;
  messages: A2uiMessage[];
  data: Record<string, unknown>;
  sources: SourceView[];
}) {
  const fieldId = useFieldStore((s) => s.field?.id ?? null);
  const pinned = usePins((s) => s.pins.some((p) => p.id === id));
  const onCard = usePinnedStore((s) => s.pinned.some((p) => p.id === id));
  const label = { question };

  const togglePin = () => {
    if (pinned) usePins.getState().unpin(id);
    else
      usePins
        .getState()
        .pin({ id, fieldId, question, caption, messages: withoutChips(messages), data });
  };
  const toggleCard = () => {
    const card = usePinnedStore.getState();
    if (onCard) {
      card.unpin(id);
      return;
    }
    // The printed card gets the sentence and where its numbers come from, as plain text.
    const from = sources.map((s) => `${s.source} · ${s.resolution} · ${s.period}`).join("; ");
    card.pin({
      id,
      fieldId,
      title: question.length > TITLE_MAX ? `${question.slice(0, TITLE_MAX - 1)}…` : question,
      text: from ? `${caption} (${from})` : caption,
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        aria-pressed={pinned}
        aria-label={fmt(t(pinned ? "assistant.pin.unpin.aria" : "assistant.pin.aria"), label)}
        onClick={togglePin}
      >
        {t(pinned ? "assistant.pin.unpin" : "assistant.pin")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        aria-pressed={onCard}
        aria-label={fmt(
          t(onCard ? "assistant.card.remove.aria" : "assistant.card.add.aria"),
          label,
        )}
        onClick={toggleCard}
      >
        {t(onCard ? "assistant.card.remove" : "assistant.card.add")}
      </Button>
    </div>
  );
}
