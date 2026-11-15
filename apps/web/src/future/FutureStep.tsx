import { Badge, Button, EmptyState, FutureToggle, Skeleton, Slider } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "../app/shell/PageHeader";
import { useCompare } from "../compare/useCompare";
import { t } from "../copy";
import { heroIdFor } from "../data";
import { fmt } from "../lib/format";
import { useFieldStore } from "../state";
import { ClimateStripes } from "./ClimateStripes";
import { SLIDER_STEPS, sspDetail, sspLabel, yearAt } from "./labels";
import { ResilienceChange } from "./ResilienceChange";
import { useFuture, useProjection } from "./useFuture";

const TODAY = "today";

function Loading({ message }: { message: string }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <p role="status" className="text-body text-ink-muted">
        {message}
      </p>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-control bg-risk-soft p-3 text-body text-risk-ink">
      {message}
    </p>
  );
}

/** The 2050 view: the same seasons on the same rotations, replayed in a changed climate. */
/** `compact`: inside the guided demo, without the page header and the way back. */
export function FutureStep({ compact = false }: { compact?: boolean } = {}) {
  const field = useFieldStore((s) => s.field);
  const geometry = field?.geometry;
  const compare = useCompare();
  const projection = useProjection(geometry ? heroIdFor(geometry) : undefined, field?.centroid);
  const [selected, setSelected] = useState<string>("ssp245");
  const [step, setStep] = useState(SLIDER_STEPS);
  const progress = step / SLIDER_STEPS;
  const future = useFuture(compare, projection.data, progress);
  const year = yearAt(step);

  const rotations = useMemo(
    () =>
      (compare.view?.rotations ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        isBaseline: r.id === compare.view?.baselineId,
      })),
    [compare.view],
  );

  if (!field) {
    return (
      <EmptyState
        title={t("future.noField")}
        action={
          <Button asChild>
            <Link to="/field">{t("future.toField")}</Link>
          </Button>
        }
      />
    );
  }

  const data = future.data;
  const options = [
    { id: TODAY, label: t("future.option.today"), detail: t("future.option.today.detail") },
    ...(data?.ssps ?? []).map((s) => {
      const detail = sspDetail(s.ssp);
      return { id: s.ssp, label: sspLabel(s.ssp), ...(detail ? { detail } : {}) };
    }),
  ];
  const isToday = selected === TODAY;
  const provenance = data?.provenance;
  const gaps = projection.data?.gaps ?? [];

  let body: React.ReactNode;
  if (projection.isError) {
    body = (
      <Failure message={fmt(t("future.error.factors"), { message: projection.error.message })} />
    );
  } else if (future.isError) {
    body = <Failure message={fmt(t("future.error.replay"), { message: future.error.message })} />;
  } else if (compare.status === "error") {
    body = (
      <Failure message={fmt(t("future.error.replay"), { message: compare.error?.message ?? "" })} />
    );
  } else if (!data) {
    body = (
      <Loading
        message={
          compare.status !== "ready"
            ? t("future.loading.compare")
            : projection.isPending
              ? t("future.loading.factors")
              : t("future.loading.replay")
        }
      />
    );
  } else {
    body = (
      <div className="space-y-6" aria-busy={future.isFetching}>
        <ClimateStripes
          climate={data.climate.filter((row) => row.id === TODAY || row.id === selected)}
          year={year}
        />
        <ResilienceChange
          future={data}
          rotations={rotations}
          selected={isToday ? null : selected}
          models={provenance?.models.length ?? 0}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {compact ? null : (
        <PageHeader
          title={t("future.title")}
          badge={<Badge tone="warn">{t("future.notForecast")}</Badge>}
          subtitle={t("future.body")}
        />
      )}
      <FutureToggle
        options={options}
        value={selected}
        onChange={setSelected}
        legend={t("future.control.legend")}
        notForecast={t("future.notForecast")}
      />
      <div className="space-y-1">
        <Slider
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={[step]}
          onValueChange={([v]) => setStep(v ?? SLIDER_STEPS)}
          thumbLabels={[t("future.slider.label")]}
          disabled={isToday}
        />
        <p className="text-caption tabular-nums text-ink-muted" aria-live="polite">
          {step === 0
            ? t("future.slider.today")
            : fmt(t("future.slider.progress"), { year, percent: Math.round(progress * 100) })}
        </p>
      </div>
      {body}
      {provenance ? (
        <section className="space-y-1 text-caption text-ink-muted">
          <p>
            {t("future.provenance.source")}: {provenance.source}
            {provenance.source_version ? ` ${provenance.source_version}` : ""}
          </p>
          <p>
            {t("future.provenance.period")}:{" "}
            {fmt(t("future.provenance.period.text"), {
              future: provenance.future_period,
              baseline: provenance.baseline_period,
            })}
          </p>
          <p>
            {t("future.provenance.resolution")}:{" "}
            {fmt(t("future.provenance.resolution.text"), { degrees: provenance.resolution_deg })}
          </p>
          <p>{fmt(t("future.provenance.models"), { models: provenance.models.join(", ") })}</p>
        </section>
      ) : null}
      {gaps.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-body font-semibold text-ink">{t("future.gaps.title")}</h2>
          <ul className="list-disc pl-5 text-caption text-ink-muted">
            {gaps.map((gap) => (
              <li key={gap.var}>
                {gap.var}: {gap.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-caption text-ink-muted">{t("future.label")}</p>
    </div>
  );
}
