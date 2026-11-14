import { Button } from "@itza/ui-kit";
import { Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";
import { t } from "../copy";
import { useAssistantUi } from "./ui";

const AssistantRoot = lazy(() => import("./AssistantRoot"));

/** Opens the assistant from every screen. */
export function AssistantButton() {
  const setOpen = useAssistantUi((s) => s.setOpen);
  return (
    <Button
      aria-haspopup="dialog"
      aria-label={t("nav.assistant")}
      onClick={() => setOpen(true)}
      className="max-sm:size-11 max-sm:px-0 lg:min-h-12"
    >
      <Sparkles aria-hidden />
      <span className="max-sm:sr-only">{t("nav.assistant")}</span>
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
