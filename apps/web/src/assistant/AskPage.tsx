import { useEffect } from "react";
import { useAssistantUi } from "./ui";

/**
 * The Ask ITZA page: a full-height frame the assistant draws its conversation into. Arriving here
 * loads the assistant if it is not loaded yet.
 */
export function AskPage() {
  const mount = useAssistantUi((s) => s.mount);
  const setSlot = useAssistantUi((s) => s.setSlot);
  useEffect(() => {
    mount();
  }, [mount]);
  return <div ref={setSlot} className="mx-auto flex h-full w-full max-w-4xl flex-col" />;
}
