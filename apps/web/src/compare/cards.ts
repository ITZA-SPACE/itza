import type { CriterionValues, EvidenceCard } from "@itza/engine/contracts";
import type { ContributionPart, EvidenceCardLabels, EvidenceCardView } from "@itza/ui-kit";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";

const CRITERIA = [
  "climate_fit",
  "water_balance",
  "soil_nitrogen",
  "organic_matter",
  "erosion_control",
  "bare_exposure",
  "pest_pressure",
  "forage_income",
] as const satisfies readonly (keyof CriterionValues)[];

export function contributionParts(values: CriterionValues): ContributionPart[] {
  return CRITERIA.map((key) => ({
    key,
    label: t(`compare.criterion.${key}` as CopyKey),
    value: values[key],
  }));
}

const DATED = /^(.*\D)(\d{4}-\d{2}-\d{2})\.?$/;

/**
 * Folds runs of gaps that differ only by date ("Greenness: no valid frame pixels on 2024-01-06",
 * then fourteen more) into one line with the count and the first and last date, so a card lists
 * what is missing, not every day it was missing.
 */
export function groupGaps(gaps: readonly string[]): string[] {
  const dated = new Map<string, string[]>();
  const order: string[] = [];
  for (const gap of gaps) {
    const match = DATED.exec(gap);
    const key = match ? (match[1] as string) : gap;
    if (!dated.has(key)) {
      dated.set(key, []);
      order.push(key);
    }
    if (match) dated.get(key)?.push(match[2] as string);
  }
  return order.map((key) => {
    const dates = (dated.get(key) ?? []).sort();
    if (dates.length === 0) return key;
    if (dates.length === 1) return `${key}${dates[0]}.`;
    return fmt(t("compare.gaps.dates"), {
      prefix: key,
      count: dates.length,
      first: dates[0] ?? "",
      last: dates[dates.length - 1] ?? "",
    });
  });
}

/** The engine's card as the props of the ui-kit card, with the title the farmer sees. */
export function toCardView(card: EvidenceCard, title: string): EvidenceCardView {
  return {
    title,
    isBaseline: card.is_baseline,
    score: card.score,
    headline: card.resilience_headline,
    confidence: {
      level: card.confidence.level,
      label: t(`confidence.${card.confidence.level}`),
      reasons: card.confidence.reasons,
    },
    why: card.why,
    evidence: card.evidence.map((item) => ({
      id: item.indicator,
      // The provenance chip beside it carries the source, resolution and period.
      sentence: `${item.indicator}: ${item.value} (${item.comparison}).`,
      source: item.source,
      resolution: item.resolution,
      period: item.period,
    })),
    benefits: card.benefits,
    gaps: groupGaps(card.gaps),
    risks: card.risks,
    contributions: contributionParts(card.contributions),
  };
}

export function cardLabels(): EvidenceCardLabels {
  return {
    score: t("compare.card.score"),
    why: t("compare.card.why"),
    evidence: t("compare.card.evidence"),
    benefits: t("compare.card.benefits"),
    gaps: t("compare.card.gaps"),
    risks: t("compare.card.risks"),
    noGaps: t("compare.card.noGaps"),
    noRisks: t("compare.card.noRisks"),
    baseline: t("compare.baseline.badge"),
    showChart: t("compare.card.showChart"),
    hideChart: t("compare.card.hideChart"),
    contributions: t("compare.card.contributions"),
    confidenceHeading: t("confidence.reasonsHeading"),
    details: t("compare.card.details"),
    moreRisks: t("compare.card.moreRisks"),
    provenance: {
      source: t("compare.provenance.source"),
      resolution: t("compare.provenance.resolution"),
      period: t("compare.provenance.period"),
    },
  };
}
