import { createComponentImplementation } from "@a2ui/react/v0_9";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { cn, focusRing } from "../../src/cn";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Dialog } from "../../src/components/Dialog";
import { ProvenanceChip } from "../../src/components/ProvenanceChip";
import {
  ACTION_CHIPS_API,
  CAPTION_API,
  CARD_API,
  CLIMATE_STRIP_API,
  COLUMN_API,
  CONFIRM_FORM_API,
  EVIDENCE_CARD_API,
  FUTURE_TOGGLE_API,
  MAP_FOCUS_API,
  REPLAY_BARS_API,
  ROTATION_COMPARE_API,
  ROW_API,
  SEASON_SNAPSHOT_API,
  SOURCE_CHIPS_API,
  TRACE_DRAWER_API,
} from "./apis";
import { type AppRenderedName, type RenderProps, useCatalogHost } from "./host";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function Unavailable() {
  const { labels } = useCatalogHost();
  return (
    <p role="status" className="rounded-control bg-surface-muted p-3 text-body text-ink-muted">
      {labels.unavailable}
    </p>
  );
}

// A binding that did not resolve stays a `{ path }` object: nothing was written there yet.
const isUnresolved = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (isRecord(value) && typeof value.path === "string" && Object.keys(value).length === 1);

/** A data component the app draws; when there is no data yet, or no drawing for it, say so. */
function appRendered(name: AppRenderedName, api: ComponentApi) {
  return createComponentImplementation(api, ({ props }) => {
    const { render } = useCatalogHost();
    const draw = render[name];
    const needsData = "data" in (props as RenderProps);
    if (!draw || (needsData && isUnresolved((props as RenderProps).data))) return <Unavailable />;
    return draw(props as RenderProps);
  });
}

export const Caption = createComponentImplementation(CAPTION_API, ({ props }) => (
  <p className="text-body text-ink">{props.text}</p>
));

function layout(direction: "column" | "row") {
  return ({ children }: { children: React.ReactNode }) => (
    <div className={cn("flex gap-3", direction === "column" ? "flex-col" : "flex-row flex-wrap")}>
      {children}
    </div>
  );
}
const ColumnBox = layout("column");
const RowBox = layout("row");

export const Column = createComponentImplementation(COLUMN_API, ({ props, buildChild }) => (
  <ColumnBox>{(props.children as (string | never)[]).map((child) => buildChild(child))}</ColumnBox>
));
export const Row = createComponentImplementation(ROW_API, ({ props, buildChild }) => (
  <RowBox>{(props.children as (string | never)[]).map((child) => buildChild(child))}</RowBox>
));
export const AnswerCard = createComponentImplementation(CARD_API, ({ props, buildChild }) => (
  <Card className="space-y-3">
    {props.title ? <h3 className="text-title font-semibold text-ink">{props.title}</h3> : null}
    {(props.children as (string | never)[]).map((child) => buildChild(child))}
  </Card>
));

export const ReplayBars = appRendered("ReplayBars", REPLAY_BARS_API);
export const RotationCompare = appRendered("RotationCompare", ROTATION_COMPARE_API);
export const EvidenceCard = appRendered("EvidenceCard", EVIDENCE_CARD_API);
export const SeasonSnapshot = appRendered("SeasonSnapshot", SEASON_SNAPSHOT_API);
export const ClimateStrip = appRendered("ClimateStrip", CLIMATE_STRIP_API);
export const FutureToggle = appRendered("FutureToggle", FUTURE_TOGGLE_API);
export const MapFocus = appRendered("MapFocus", MAP_FOCUS_API);
export const ConfirmForm = appRendered("ConfirmForm", CONFIRM_FORM_API);

export const ActionChips = createComponentImplementation(ACTION_CHIPS_API, ({ props }) => {
  const { onAction } = useCatalogHost();
  return (
    <ul className="flex flex-wrap gap-2">
      {(
        props.chips as unknown as { label: string; action: { name: string; context?: never } }[]
      ).map((chip) => (
        <li key={`${chip.action.name}:${chip.label}`}>
          <Button
            variant="secondary"
            onClick={() => onAction(chip.action as never)}
            className="min-h-11"
          >
            {chip.label}
          </Button>
        </li>
      ))}
    </ul>
  );
});

interface SourceView {
  source: string;
  resolution: string;
  period: string;
}
const isSource = (value: unknown): value is SourceView =>
  isRecord(value) &&
  typeof value.source === "string" &&
  typeof value.resolution === "string" &&
  typeof value.period === "string";

export const SourceChips = createComponentImplementation(SOURCE_CHIPS_API, ({ props }) => {
  const { labels } = useCatalogHost();
  const sources = Array.isArray(props.data) ? props.data.filter(isSource) : [];
  if (sources.length === 0) return null;
  return (
    <section aria-label={labels.sourcesHeading} className="space-y-1">
      <h4 className="text-caption font-medium text-ink-muted">{labels.sourcesHeading}</h4>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <li key={`${s.source}|${s.resolution}|${s.period}`}>
            <ProvenanceChip
              source={s.source}
              resolution={s.resolution}
              period={s.period}
              labels={labels.provenance}
            />
          </li>
        ))}
      </ul>
    </section>
  );
});

interface CallView {
  tool: string;
  summary: string;
}
const isCall = (value: unknown): value is CallView =>
  isRecord(value) && typeof value.tool === "string" && typeof value.summary === "string";

export const TraceDrawer = createComponentImplementation(TRACE_DRAWER_API, ({ props }) => {
  const { labels } = useCatalogHost();
  const calls = Array.isArray(props.data) ? props.data.filter(isCall) : [];
  return (
    <Dialog
      variant="drawer"
      title={labels.traceTitle}
      closeLabel={labels.traceClose}
      trigger={
        <button
          type="button"
          className={cn("min-h-11 rounded-control px-3 text-body text-accent underline", focusRing)}
        >
          {labels.traceOpen}
        </button>
      }
    >
      {calls.length === 0 ? (
        <p className="text-ink-muted">{labels.traceEmpty}</p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5">
          {calls.map((call, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same tool can run twice in one turn
            <li key={`${call.tool}-${i}`}>
              <span className="font-mono text-caption">{call.tool}</span>
              <p className="text-ink-muted">{call.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
});
