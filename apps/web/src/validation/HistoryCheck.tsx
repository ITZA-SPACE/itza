import { Badge, Card } from "@itza/ui-kit";
import { useMemo } from "react";
import { AppConfidenceBadge } from "../confidence";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { type ProofFieldHistory, SYNTHETIC_PROOF_FIELDS, summarizeConfusion } from "./groundTruth";

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

function ProofFieldTable({ field }: { field: ProofFieldHistory }) {
  return (
    <Card className="space-y-2">
      <h3 className="text-body font-semibold text-ink">{field.name}</h3>
      <table className="w-full text-left text-caption">
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
    </Card>
  );
}

/** History check (F-22): Field Memory's inferred label next to the public record, per season. */
export function HistoryCheck() {
  const summary = useMemo(() => summarizeConfusion(SYNTHETIC_PROOF_FIELDS), []);
  return (
    <section className="space-y-3">
      <h2 className="text-title font-semibold text-ink">{t("validation.history.title")}</h2>
      <p className="text-body text-ink-muted">{t("validation.history.intro")}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {SYNTHETIC_PROOF_FIELDS.map((field) => (
          <ProofFieldTable key={field.id} field={field} />
        ))}
      </div>
      <Card className="space-y-1">
        <h3 className="text-body font-semibold text-ink">
          {fmt(t("validation.history.summaryTitle"), {
            seasons: summary.totalSeasons,
            fields: summary.proofFields,
          })}
        </h3>
        <p className="text-body text-ink">
          {fmt(t("validation.history.summaryAgreement"), {
            percent: Math.round(summary.agreement * 100),
          })}
        </p>
        <p className="text-caption text-ink-muted">
          {fmt(t("validation.history.summaryBreakdown"), {
            cropCrop: summary.cropCrop,
            fallowFallow: summary.fallowFallow,
            cropFallow: summary.cropFallow,
            fallowCrop: summary.fallowCrop,
          })}
        </p>
      </Card>
    </section>
  );
}
