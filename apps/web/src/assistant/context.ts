import type { ChipAction } from "@itza/ui-kit/catalog/react";
import { createContext, useContext } from "react";

export type ChipOutcome = "ok" | "notFound";

export interface AssistantActions {
  /** Runs an action chip on the answer in `messageId`; rejects when the action fails. */
  runChip: (action: ChipAction, messageId: string) => Promise<ChipOutcome>;
}

export const ActionsContext = createContext<AssistantActions | null>(null);

export function useAssistantActions(): AssistantActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("useAssistantActions needs the assistant");
  return actions;
}
