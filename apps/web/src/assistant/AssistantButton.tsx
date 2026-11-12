import { Button } from "@itza/ui-kit";
import { lazy, Suspense } from "react";
import { t } from "../copy";
import { useAssistantUi } from "./ui";

const AssistantRoot = lazy(() => import("./AssistantRoot"));

/** Opens the assistant from every screen. */
export function AssistantButton() {
  const setOpen = useAssistantUi((s) => s.setOpen);
  return (
    <Button variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {t("assistant.open")}
    </Button>
  );
}

/** The assistant itself: its code loads when it is first opened, and its chat stays after that. */
export function AssistantHost() {
  const mounted = useAssistantUi((s) => s.mounted);
  return mounted ? (
    <Suspense fallback={null}>
      <AssistantRoot />
    </Suspense>
  ) : null;
}
