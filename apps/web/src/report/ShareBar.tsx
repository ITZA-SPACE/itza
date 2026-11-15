import type { CompareResult, Weighted } from "@itza/engine/worker";
import { Button, Dialog } from "@itza/ui-kit";
import { Copy, Link2, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBuilderStore } from "../builder/designStore";
import { t } from "../copy";
import { useFieldStore } from "../state";
import { snapshotOf } from "../state/persistence";
import { Qr } from "./Qr";
import { RotationCard } from "./RotationCard";
import { encodeShared, shareUrl } from "./shareLink";

/** The link that restores this field, inputs, history, scenario and scored design; null while it is being made. */
function useShareLink(): string | null {
  const field = useFieldStore((s) => s.field);
  const history = useFieldStore((s) => s.confirmedHistory);
  const inputs = useFieldStore((s) => s.inputs);
  const priorities = useFieldStore((s) => s.priorities);
  const scenario = useFieldStore((s) => s.scenario);
  const groundTruth = useFieldStore((s) => s.groundTruth);
  const design = useBuilderStore((s) => s.scored);
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!field) return;
    let current = true;
    const work = { confirmedHistory: history, inputs, priorities, scenario, groundTruth };
    void encodeShared({ snapshot: snapshotOf(field, work), design }).then((payload) => {
      if (current) setLink(shareUrl(location.origin, payload));
    });
    return () => {
      current = false;
    };
  }, [field, history, inputs, priorities, scenario, groundTruth, design]);
  return link;
}

/** "Share": a dialog with the printable card, its QR code, the link to copy and Print. */
export function ShareBar({ view }: { view: CompareResult & Weighted }) {
  const field = useFieldStore((s) => s.field);
  const link = useShareLink();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The card lives outside the app root so the print stylesheet can show it alone.
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "print-root";
    document.body.append(el);
    setPrintRoot(el);
    return () => el.remove();
  }, []);
  if (!field) return null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage(t("report.share.copied"));
    } catch {
      setMessage(t("report.share.failed"));
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Share2 aria-hidden />
        {t("report.share.open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="xl"
        title={t("report.share.title")}
        closeLabel={t("report.share.close")}
      >
        <div className="grid min-h-0 gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="paper max-h-[65dvh] overflow-y-auto rounded-panel p-5 shadow-glass-card">
            {link ? <RotationCard view={view} field={field} link={link} /> : null}
          </div>
          <aside className="flex flex-col gap-3">
            <div className="mx-auto rounded-panel bg-white p-3">
              {link ? (
                <Qr text={link} label={t("report.card.qr.label")} />
              ) : (
                <div className="size-32" />
              )}
            </div>
            <button
              type="button"
              onClick={copy}
              disabled={!link}
              className="glass-control flex min-h-11 items-center gap-2 rounded-full px-4 text-caption text-ink hover:bg-glass-strong disabled:opacity-50"
            >
              <Link2 aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                {link ? link.replace(/^https?:\/\//, "") : t("report.share.preparing")}
              </span>
              <Copy aria-hidden className="size-4 shrink-0 text-subtle" />
            </button>
            <p role="status" className="min-h-5 text-caption text-ink-muted">
              {message ?? t("report.share.note")}
            </p>
            {message === t("report.share.failed") && link ? (
              <input
                readOnly
                value={link}
                aria-label={t("report.share")}
                className="w-full rounded-full border border-line px-3 py-1.5 text-caption"
                onFocus={(e) => e.currentTarget.select()}
              />
            ) : null}
            <div className="mt-auto space-y-2">
              <Button className="w-full" onClick={() => window.print()} disabled={!link}>
                <Printer aria-hidden />
                {t("report.print")}
              </Button>
              <p className="text-center text-caption text-subtle">{t("report.print.hint")}</p>
            </div>
          </aside>
        </div>
      </Dialog>
      {printRoot && link
        ? createPortal(<RotationCard view={view} field={field} link={link} />, printRoot)
        : null}
    </>
  );
}
