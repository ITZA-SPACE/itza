import { AnswerSurface } from "@itza/ui-kit/catalog/react";
import { useMemo } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { useFieldStore } from "../state";
import { AnswerActions } from "./AnswerActions";
import { makeHost } from "./host";
import { usePins } from "./pins";

/** The answers pinned for the selected field, drawn again from what was saved with them. */
export function PinnedAnswers() {
  const fieldId = useFieldStore((s) => s.field?.id ?? null);
  const all = usePins((s) => s.pins);
  const pins = useMemo(() => all.filter((p) => p.fieldId === fieldId), [all, fieldId]);
  // A saved answer is a record: nothing runs when it is tapped.
  const host = useMemo(() => makeHost(() => {}), []);
  return (
    <section
      aria-label={t("assistant.pinned.title")}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto"
    >
      {pins.length === 0 ? (
        <p className="text-body text-ink-muted">{t("assistant.pinned.empty")}</p>
      ) : (
        <ul className="space-y-6">
          {pins.map((pin) => (
            <li key={pin.id} className="space-y-2 rounded-card border border-line-soft p-3">
              <p className="text-caption text-ink-muted">
                {fmt(t("assistant.pinned.question"), { question: pin.question })}
              </p>
              <AnswerSurface messages={pin.messages} data={pin.data} host={host} />
              <AnswerActions
                id={pin.id}
                question={pin.question}
                caption={pin.caption}
                messages={pin.messages}
                data={pin.data}
                sources={[]}
              />
            </li>
          ))}
        </ul>
      )}
      {all.length > pins.length ? (
        <p className="text-caption text-ink-muted">{t("assistant.pinned.otherField")}</p>
      ) : null}
    </section>
  );
}
