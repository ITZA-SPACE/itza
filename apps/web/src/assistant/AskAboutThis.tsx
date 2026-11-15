import { Button, IconButton, Tooltip } from "@itza/ui-kit";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { useAssistantUi } from "./ui";

export type AskKind = "card" | "season" | "bar" | "zone";

export interface AskAboutThisProps {
  kind: AskKind;
  /** Id the assistant can pass to its tools, such as a rotation id or season label. */
  id: string;
  /** What the farmer sees named: the rotation, season or zone. */
  label: string;
  /** For a bar: the season the bar is in. */
  season?: string;
  /** A round icon button (name in its tooltip) instead of a text button. */
  iconOnly?: boolean;
}

function questionOf({ kind, id, label, season }: AskAboutThisProps): string {
  switch (kind) {
    case "card":
      return `${fmt(t("assistant.ask.card"), { name: label })} (id: ${id})`;
    case "season":
      return fmt(t("assistant.ask.season"), { season: label });
    case "bar":
      return `${fmt(t("assistant.ask.bar"), { season: season ?? id, name: label })} (id: ${id})`;
    case "zone":
      return fmt(t("assistant.ask.zone"), { name: label });
  }
}

/** Sends an element of the screen to the assistant as the question's context (F-15). */
export function AskAboutThis(props: AskAboutThisProps) {
  const ask = useAssistantUi((s) => s.ask);
  const navigate = useNavigate();
  const go = () => {
    ask(questionOf(props));
    void navigate({ to: "/ask" });
  };
  if (props.iconOnly) {
    return (
      <Tooltip content={t("assistant.ask.label")}>
        <IconButton label={`${t("assistant.ask.label")}: ${props.label}`} onClick={go}>
          <Sparkles aria-hidden />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${t("assistant.ask.label")}: ${props.label}`}
      onClick={() => {
        ask(questionOf(props));
        void navigate({ to: "/ask" });
      }}
    >
      <Sparkles aria-hidden />
      {t("assistant.ask.label")}
    </Button>
  );
}
