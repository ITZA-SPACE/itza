import { Button, ProvenanceChip, Toggle } from "@itza/ui-kit";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppConfidenceBadge } from "../../confidence";
import { t } from "../../copy";
import type { FieldPolygon } from "../../state";
import { BoundaryError, type BoundaryProposal, type Progress, proposeBoundary } from "./api";
import { clearProposal, showProposal } from "./layer";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; progress: Progress | null }
  | { kind: "proposal"; proposal: BoundaryProposal }
  | { kind: "error"; message: string };

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const ERRORS = {
  "no-field": "clickToField.error.noField",
  timeout: "clickToField.error.timeout",
  unavailable: "clickToField.error.unavailable",
} as const;

interface Props {
  map: MapLibreMap | null;
  ready: boolean;
  /** Another map tool is active, so a click belongs to it. */
  suspended: boolean;
  /** Called when the user takes control of the map (so any drawing tool is put down). */
  onStart: () => void;
  onAccept: (polygon: FieldPolygon) => void;
  /** Accept and keep editing the corners. */
  onEdit: (polygon: FieldPolygon) => void;
}

/** "Click to field" (F-24): click inside a field, review the proposed outline, accept or adjust. */
export function ClickToField({ map, ready, suspended, onStart, onAccept, onEdit }: Props) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const request = useRef<AbortController | null>(null);
  const on = active && !suspended;

  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (map) clearProposal(map);
    setStatus({ kind: "idle" });
  }, [map]);

  // A click anywhere on the map asks for a proposal; only the latest one is kept.
  useEffect(() => {
    if (!map || !ready || !on) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    const onClick = (event: { lngLat: { lng: number; lat: number } }) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      clearProposal(map);
      setStatus({ kind: "loading", progress: null });
      proposeBoundary([event.lngLat.lng, event.lngLat.lat], controller.signal, (progress) => {
        if (!controller.signal.aborted) setStatus({ kind: "loading", progress });
      }).then(
        (proposal) => {
          if (controller.signal.aborted) return;
          showProposal(map, proposal.geometry);
          setStatus({ kind: "proposal", proposal });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const kind = error instanceof BoundaryError ? error.kind : "unavailable";
          setStatus({ kind: "error", message: t(ERRORS[kind]) });
        },
      );
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [map, ready, on]);

  // Leaving the mode (or another tool taking over) drops any pending request and the outline.
  useEffect(() => {
    if (!on) reset();
  }, [on, reset]);

  useEffect(() => () => request.current?.abort(), []);

  const finish = (polygon: FieldPolygon, edit: boolean) => {
    reset();
    setActive(false);
    (edit ? onEdit : onAccept)(polygon);
  };

  return (
    <div className="pointer-events-auto space-y-2">
      <fieldset className="m-0 flex gap-2 rounded-card border-0 bg-surface/95 p-2 shadow-sm">
        <legend className="sr-only">{t("clickToField.toggle")}</legend>
        <Toggle
          pressed={on}
          onPressedChange={(pressed) => {
            setActive(pressed);
            if (pressed) onStart();
          }}
          disabled={!ready}
        >
          {t("clickToField.toggle")}
        </Toggle>
      </fieldset>
      {on ? (
        <div
          aria-live="polite"
          className="space-y-2 rounded-card bg-surface/95 p-3 text-caption text-ink shadow-sm"
        >
          {status.kind === "idle" ? <p className="m-0">{t("clickToField.hint.idle")}</p> : null}
          {status.kind === "loading" ? (
            <div className="space-y-2">
              <p className="m-0">{t("clickToField.loading")}</p>
              {status.progress && status.progress.total > 0 ? (
                <p className="m-0">
                  {fill(t("clickToField.progress"), {
                    done: status.progress.done,
                    total: status.progress.total,
                  })}
                </p>
              ) : null}
              <Button variant="secondary" onClick={reset}>
                {t("clickToField.cancel")}
              </Button>
            </div>
          ) : null}
          {status.kind === "error" ? (
            <p role="alert" className="m-0 text-risk-ink">
              {status.message}
            </p>
          ) : null}
          {status.kind === "proposal" ? (
            <Proposal
              proposal={status.proposal}
              onAccept={() => finish(status.proposal.geometry, false)}
              onEdit={() => finish(status.proposal.geometry, true)}
              onCancel={reset}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Proposal({
  proposal,
  onAccept,
  onEdit,
  onCancel,
}: {
  proposal: BoundaryProposal;
  onAccept: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="m-0 font-medium text-title">
        {t("clickToField.title")}: {proposal.areaHa.toFixed(1)} {t("clickToField.unit.ha")}
      </p>
      <AppConfidenceBadge
        level={proposal.confidence}
        reasons={[fill(t("clickToField.confidence.reason"), { dates: proposal.datesUsed })]}
      />
      <ProvenanceChip
        source={t("clickToField.provenance.name")}
        resolution={`${proposal.source.resolutionM} m`}
        period={fill(t("clickToField.provenance.period.value"), proposal.period)}
        labels={{
          source: t("clickToField.provenance.source"),
          resolution: t("clickToField.provenance.resolution"),
          period: t("clickToField.provenance.period"),
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAccept}>{t("clickToField.accept")}</Button>
        <Button variant="secondary" onClick={onEdit}>
          {t("clickToField.edit")}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t("clickToField.cancel")}
        </Button>
      </div>
    </div>
  );
}
