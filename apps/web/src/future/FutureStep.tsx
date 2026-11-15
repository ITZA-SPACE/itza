import { Button, Disclosure, EmptyState, FutureToggle, Skeleton, Slider } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "../app/shell/PageHeader";
import { useCompare } from "../compare/useCompare";
import { t } from "../copy";
import { heroIdFor } from "../data";
import { fmt } from "../lib/format";
import { useFieldStore } from "../state";
import { headline, outlook, shortNames } from "./analysis";
import { ClimateStripes } from "./ClimateStripes";
import { FutureSummary } from "./FutureSummary";
import { SLIDER_STEPS, sspDetail, sspLabel, yearAt } from "./labels";
import { OutlookList } from "./OutlookList";
import { useFuture, useProjection } from "./useFuture";

/** Plain scenario names on the control; the SSP code stays as the detail line. */
const SHORT: Record<string, [Parameters<typeof t>[0], Parameters<typeof t>[0]]> = {
  ssp126: ["future.option.low", "future.option.low.detail"],
  ssp245: ["future.option.middle", "future.option.middle.detail"],
  ssp370: ["future.option.high", "future.option.high.detail"],
};

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

/** No 2050 replay: one honest card, the technical reason in small print. */
function Failure({ message }: { message: string }) {
  return (
    <div role="alert">
      <EmptyState title={t("future.unavailable")} description={message} />
    </div>
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
      const short = SHORT[s.ssp];
      return short
        ? { id: s.ssp, label: t(short[0]), detail: t(short[1]) }
        : { id: s.ssp, label: sspLabel(s.ssp) };
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
    const ssp = isToday ? null : selected;
    const rows = outlook(data, rotations, ssp);
    const short = new Map(
      rows.map((r, i) => [r.id, shortNames(rows.map((x) => x.name))[i] ?? r.name]),
    );
    body = (
      <div className="space-y-4" aria-busy={future.isFetching}>
        <FutureSummary
          headline={headline(data, rotations, ssp)}
          nameOf={(id) => short.get(id) ?? id}
        />
        <OutlookList rows={rows} live={!isToday} level={sspDetail(selected) ?? selected} />
        <ClimateStripes
          climate={data.climate.filter((row) => row.id === TODAY || row.id === selected)}
          year={year}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {compact ? null : <PageHeader title={t("future.title")} subtitle={t("future.body")} />}
      {data ? (
        <>
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
        </>
      ) : null}
      {body}
      {provenance || gaps.length > 0 ? (
        <Disclosure summary={t("future.details")}>
          <div className="space-y-3">
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
                  {fmt(t("future.provenance.resolution.text"), {
                    degrees: provenance.resolution_deg,
                  })}
                </p>
                <p>
                  {fmt(t("future.provenance.models"), { models: provenance.models.join(", ") })}
                </p>
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
          </div>
        </Disclosure>
      ) : null}
      <p className="text-caption text-ink-muted">{t("future.label")}</p>
    </div>
  );
}
