import { Badge, Card, ProvenanceChip } from "@itza/ui-kit";
import { AppConfidenceBadge } from "../confidence";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { type ProofFieldHistory, type SkippedSeason, summarizeConfusion } from "./groundTruth";

/** The PRD's target for agreement between inferred history and the public record (§3.3). */
export const AGREEMENT_TARGET = 0.8;

function SeasonRow({ season }: { season: ProofFieldHistory["seasons"][number] }) {
  const matches = season.inferredClass === season.groundTruthClass;
  return (
    <tr>
      <td className="py-1 pr-3 text-ink">{season.season}</td>
      <td className="py-1 pr-3 text-ink">
        {season.inferredCrop} <AppConfidenceBadge level={season.inferredConfidence} />
      </td>
      <td className="py-1 pr-3 text-ink">{season.groundTruthCrop}</td>
      <td className="py-1">
        <Badge tone={matches ? "good" : "risk"}>
          {matches ? t("validation.history.match") : t("validation.history.mismatch")}
        </Badge>
      </td>
    </tr>
  );
}

const SKIP_COPY = {
  fieldMemoryUncertain: "validation.history.skip.uncertain",
  fieldMemoryNoData: "validation.history.skip.noData",
  recordMixed: "validation.history.skip.mixed",
} as const;

function Skipped({ items }: { items: SkippedSeason[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-caption text-ink-muted">
      {t("validation.history.skipped")}{" "}
      {items.map((s) => `${s.season} (${t(SKIP_COPY[s.reason])})`).join(", ")}.
    </p>
  );
}

function ProofFieldTable({ field }: { field: ProofFieldHistory }) {
  const agree = field.seasons.filter((s) => s.inferredClass === s.groundTruthClass).length;
  return (
    <Card className="min-w-0 space-y-2">
      <h3 className="text-body font-semibold text-ink">{field.name}</h3>
      <p className="text-caption text-ink-muted">
        {fmt(t("validation.history.fieldAgreement"), { agree, total: field.seasons.length })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-caption">
          <caption className="sr-only">{field.name}</caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("validation.history.columnSeason")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("validation.history.columnInferred")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("validation.history.columnGroundTruth")}
              </th>
              <th scope="col" className="py-1 font-medium">
                <span className="sr-only">{t("validation.history.match")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {field.seasons.map((season) => (
              <SeasonRow key={season.season} season={season} />
            ))}
          </tbody>
        </table>
      </div>
      <Skipped items={field.skipped} />
    </Card>
  );
}

/**
 * History check (F-22): Field Memory's inferred label next to the public record, per season, for
 * every proof field. The result is shown whatever it is, with the PRD target stated beside it.
 */
export function HistoryCheck({ fields }: { fields: readonly ProofFieldHistory[] }) {
  const summary = summarizeConfusion(fields);
  const percent = Math.round(summary.agreement * 100);
  const meets = summary.agreement >= AGREEMENT_TARGET;
  return (
    <section className="space-y-3">
      <h2 className="text-title font-semibold text-ink">{t("validation.history.title")}</h2>
      <p className="text-body text-ink-muted">{t("validation.history.intro")}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((field) => (
          <ProofFieldTable key={field.id} field={field} />
        ))}
      </div>
      <Card className="space-y-2">
        <h3 className="text-body font-semibold text-ink">
          {fmt(t("validation.history.summaryTitle"), {
            seasons: summary.totalSeasons,
            fields: summary.proofFields,
          })}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-body text-ink">
          {fmt(t("validation.history.summaryAgreement"), { percent })}
          <Badge tone={meets ? "good" : "warn"}>
            {fmt(t(meets ? "validation.history.targetMet" : "validation.history.targetMissed"), {
              target: Math.round(AGREEMENT_TARGET * 100),
            })}
          </Badge>
        </p>
        <p className="text-caption text-ink-muted">
          {fmt(t("validation.history.summaryBreakdown"), {
            cropCrop: summary.cropCrop,
            fallowFallow: summary.fallowFallow,
            cropFallow: summary.cropFallow,
            fallowCrop: summary.fallowCrop,
          })}
        </p>
        {summary.cropFallow > summary.fallowCrop ? (
          <p className="text-caption text-ink-muted">{t("validation.history.reason")}</p>
        ) : null}
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
      </Card>
    </section>
  );
}

const labels = {
  source: t("validation.provenance.label.source"),
  resolution: t("validation.provenance.label.resolution"),
  period: t("validation.provenance.label.period"),
};
