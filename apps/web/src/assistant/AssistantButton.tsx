import { Button } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";
import { t } from "../copy";
import { useAssistantUi } from "./ui";

const AssistantRoot = lazy(() => import("./AssistantRoot"));

/** Opens the Ask ITZA page from the top bar on wide screens (phones use the bottom bar). */
export function AssistantButton() {
  return (
    <Button asChild className="lg:min-h-12">
      <Link to="/ask" activeProps={{ "aria-current": "page" }}>
        <Sparkles aria-hidden />
        {t("nav.assistant")}
      </Link>
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
