import { Button } from "@itza/ui-kit";
import { t } from "../copy";
import { updateApp, useOnline, usePwaStore } from "./pwa";

/** Offline badge in the header and the update toast; both are announced politely, never modal. */
export function OfflineIndicator() {
  const online = useOnline();
  return (
    <span role="status" className="contents">
      {online ? null : (
        <span className="rounded-control bg-surface-muted px-2 py-1 text-caption font-semibold text-ink">
          {t("pwa.offline")}
        </span>
      )}
    </span>
  );
}

export function UpdateToast() {
  const ready = usePwaStore((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-lg"
    >
      <p className="flex-1 text-body text-ink">{t("pwa.update.message")}</p>
      <Button onClick={updateApp}>{t("pwa.update.action")}</Button>
    </div>
  );
}
