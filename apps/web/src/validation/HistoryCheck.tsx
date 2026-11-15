import { Card, cn, Disclosure, ProvenanceChip, TableScroll } from "@itza/ui-kit";
import { Check, X } from "lucide-react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { type ProofFieldHistory, type SkippedSeason, summarizeConfusion } from "./groundTruth";

/** The PRD's target for agreement between inferred history and the public record (§3.3). */
export const AGREEMENT_TARGET = 0.8;

const SKIP_COPY = {
  fieldMemoryUncertain: "validation.history.skip.uncertain",
  fieldMemoryNoData: "validation.history.skip.noData",
  recordMixed: "validation.history.skip.mixed",
} as const;

const CONFIDENCE_DOTS = { high: 3, medium: 2, low: 1 } as const;

function Skipped({ items }: { items: SkippedSeason[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-caption text-ink-muted">
      {t("validation.history.skipped")}{" "}
      {items.map((s) => `${s.season} (${t(SKIP_COPY[s.reason])})`).join(", ")}.
    </p>
  );
}

/** One square per season: green tick when Field Memory and the record agree, red cross when not. */
export function SeasonStrip({ field }: { field: ProofFieldHistory }) {
  return (
    <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(2rem,1fr))]">
      {field.seasons.map((s) => {
        const ok = s.inferredClass === s.groundTruthClass;
        const label = `${s.season}: ${s.inferredCrop} / ${s.groundTruthCrop}, ${t(
          ok ? "validation.history.match" : "validation.history.mismatch",
        )}`;
        return (
          <li
            key={s.season}
            title={label}
            className={cn(
              "flex aspect-square items-center justify-center rounded-[0.5rem] border",
              ok
                ? "border-good-ink/60 bg-good-soft text-good-ink"
                : "border-risk-ink/60 bg-risk-soft text-risk-ink",
            )}
          >
            {ok ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ProofFieldCard({ field }: { field: ProofFieldHistory }) {
  const agree = field.seasons.filter((s) => s.inferredClass === s.groundTruthClass).length;
  const total = field.seasons.length;
  const share = total > 0 ? agree / total : 0;
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-body font-semibold text-ink">{field.name}</h3>
      <p className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-display text-[2.5rem] leading-none font-bold tabular-nums",
            share >= AGREEMENT_TARGET ? "text-good-ink" : "text-warn-ink",
          )}
        >
          {agree}
        </span>
        <span className="text-caption text-ink-muted">
          {fmt(t("validation.history.ofSeasons"), { total })}
        </span>
      </p>
      <SeasonStrip field={field} />
      <Disclosure summary={t("validation.history.details")} count={total}>
        <TableScroll label={field.name}>
          <table className="w-full text-left text-caption">
            <caption className="sr-only">{field.name}</caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="font-medium">
                  {t("validation.history.columnSeason")}
                </th>
                <th scope="col" className="font-medium">
                  {t("validation.history.columnInferred")}
                </th>
                <th scope="col" className="font-medium">
                  {t("validation.history.columnGroundTruth")}
                </th>
                <th scope="col">
                  <span className="sr-only">{t("validation.history.match")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {field.seasons.map((s) => {
                const ok = s.inferredClass === s.groundTruthClass;
                return (
                  <tr key={s.season} className="border-t border-line-soft">
                    <th scope="row" className="font-normal whitespace-nowrap text-ink">
                      {s.season}
                    </th>
                    <td className="text-ink">
                      <span className="whitespace-nowrap">{s.inferredCrop}</span>
                      <span
                        className="ml-1.5 text-ink-muted"
                        title={t(`confidence.${s.inferredConfidence}`)}
                      >
                        {"●".repeat(CONFIDENCE_DOTS[s.inferredConfidence])}
                        <span className="sr-only">{t(`confidence.${s.inferredConfidence}`)}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-ink">{s.groundTruthCrop}</td>
                    <td className={ok ? "text-good-ink" : "text-risk-ink"}>
                      {ok ? (
                        <Check aria-hidden className="size-4" />
                      ) : (
                        <X aria-hidden className="size-4" />
                      )}
                      <span className="sr-only">
                        {t(ok ? "validation.history.match" : "validation.history.mismatch")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Disclosure>
      <Skipped items={field.skipped} />
    </Card>
  );
}

/** Crop/fallow confusion as a 2×2 grid: the diagonal agrees, the other two cells are the misses. */
function Confusion({ summary }: { summary: ReturnType<typeof summarizeConfusion> }) {
  const cells = [
    { key: "cropCrop", value: summary.cropCrop, ok: true },
    { key: "cropFallow", value: summary.cropFallow, ok: false },
    { key: "fallowCrop", value: summary.fallowCrop, ok: false },
    { key: "fallowFallow", value: summary.fallowFallow, ok: true },
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-2">
      {cells.map((c) => (
        <div
          key={c.key}
          className={cn(
            "flex flex-col-reverse gap-1 rounded-panel border px-4 py-3",
            c.ok ? "border-good-ink/40 bg-good-soft" : "border-risk-ink/40 bg-risk-soft",
          )}
        >
          <dt className="text-caption text-ink-muted">{t(`validation.history.cell.${c.key}`)}</dt>
          <dd
            className={cn(
              "font-display text-title font-bold tabular-nums",
              c.ok ? "text-good-ink" : "text-risk-ink",
            )}
          >
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * History check (F-22): Field Memory's inferred label next to the public record, per season, for
 * every proof field. The result is shown whatever it is, with the PRD target stated beside it.
 */
export function HistoryCheck({
  fields,
  detail = false,
}: {
  fields: readonly ProofFieldHistory[];
  /** Inside "All the evidence": the headline number is already shown above, so skip it. */
  detail?: boolean;
}) {
  const summary = summarizeConfusion(fields);
  const percent = Math.round(summary.agreement * 100);
  const meets = summary.agreement >= AGREEMENT_TARGET;
  if (detail) {
    return (
      <section className="space-y-3">
        <h3 className="text-body font-semibold text-ink">{t("validation.history.title")}</h3>
        <Confusion summary={summary} />
        <div className="flex flex-wrap gap-2">
          <ProvenanceChip
            source={t("validation.provenance.fieldMemory.source")}
            resolution={t("validation.provenance.fieldMemory.resolution")}
            period={t("validation.provenance.fieldMemory.period")}
            labels={labels}
          />
          <ProvenanceChip
            source={t("validation.provenance.cdl.source")}
            resolution={t("validation.provenance.cdl.resolution")}
            period={t("validation.provenance.cdl.period")}
            labels={labels}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {fields.map((field) => (
            <ProofFieldCard key={field.id} field={field} />
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="sr-only">{t("validation.history.title")}</h2>
      <Card className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-2">
          <p className="text-caption text-ink-muted">
            {fmt(t("validation.history.summaryTitle"), {
              seasons: summary.totalSeasons,
              fields: summary.proofFields,
            })}
          </p>
          <p className="flex items-baseline gap-3">
            <span
              className={`font-display text-[4rem] leading-none font-bold tabular-nums ${meets ? "text-leaf" : "text-harvest"}`}
            >
              {percent}%
            </span>
            <span className="text-caption text-ink-muted">
              {fmt(t(meets ? "validation.history.targetMet" : "validation.history.targetMissed"), {
                target: Math.round(AGREEMENT_TARGET * 100),
              })}
            </span>
          </p>
          {summary.cropFallow > summary.fallowCrop ? (
            <p className="text-caption text-ink-muted">{t("validation.history.reason")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <ProvenanceChip
              source={t("validation.provenance.fieldMemory.source")}
              resolution={t("validation.provenance.fieldMemory.resolution")}
              period={t("validation.provenance.fieldMemory.period")}
              labels={labels}
            />
            <ProvenanceChip
              source={t("validation.provenance.cdl.source")}
              resolution={t("validation.provenance.cdl.resolution")}
              period={t("validation.provenance.cdl.period")}
              labels={labels}
            />
          </div>
        </div>
        <Confusion summary={summary} />
      </Card>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {fields.map((field) => (
          <ProofFieldCard key={field.id} field={field} />
        ))}
      </div>
    </section>
  );
}

const labels = {
  source: t("validation.provenance.label.source"),
  resolution: t("validation.provenance.label.resolution"),
  period: t("validation.provenance.label.period"),
};
