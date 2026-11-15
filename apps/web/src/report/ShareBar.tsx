import type { CompareResult, Weighted } from "@itza/engine/worker";
import { Button } from "@itza/ui-kit";
import { Link2, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBuilderStore } from "../builder/designStore";
import { t } from "../copy";
import { useFieldStore } from "../state";
import { snapshotOf } from "../state/persistence";
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

/** "Copy share link" and "Print rotation card" for the comparison on screen. */
export function ShareBar({ view }: { view: CompareResult & Weighted }) {
  const field = useFieldStore((s) => s.field);
  const link = useShareLink();
  const [message, setMessage] = useState<string | null>(null);
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
    <div className="space-y-2 sm:max-w-sm">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copy} disabled={!link}>
          <Link2 aria-hidden />
          {link ? t("report.share") : t("report.share.preparing")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.print()}
          disabled={!link}
          title={t("report.print.hint")}
        >
          <Printer aria-hidden />
          {t("report.print")}
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-caption text-ink">
          {message}
        </p>
      ) : null}
      {message === t("report.share.failed") && link ? (
        <input
          readOnly
          value={link}
          aria-label={t("report.share")}
          className="w-full rounded-full border border-line px-3 py-1.5 text-caption"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
      {printRoot && link
        ? createPortal(<RotationCard view={view} field={field} link={link} />, printRoot)
        : null}
    </div>
  );
}
