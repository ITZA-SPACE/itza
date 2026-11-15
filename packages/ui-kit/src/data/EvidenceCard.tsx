import { type ReactNode, useState } from "react";
import { cn, focusRing } from "../cn";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { ConfidenceBadge, type ConfidenceLevel } from "../components/ConfidenceBadge";
import { Disclosure } from "../components/Disclosure";
import { ProvenanceChip } from "../components/ProvenanceChip";
import { ContributionBar, type ContributionPart } from "./ContributionBar";

export interface EvidenceItemView {
  id: string;
  /** The fact as a sentence, from the engine's templates. */
  sentence: string;
  source: string;
  resolution: string;
  period: string;
}

export interface EvidenceCardLabels {
  score: string;
  why: string;
  evidence: string;
  benefits: string;
  gaps: string;
  risks: string;
  noGaps: string;
  noRisks: string;
  /** Shown on the baseline card, e.g. "Your current rotation". */
  baseline: string;
  showChart: string;
  hideChart: string;
  contributions: string;
  confidenceHeading: string;
  /** Summary of the fold holding evidence, benefits and gaps, e.g. "Evidence, benefits and gaps". */
  details?: string;
  /** Button that shows the remaining risks; "{n}" is their count, e.g. "Show {n} more". */
  moreRisks?: string;
  provenance: { source: string; resolution: string; period: string };
}

export interface EvidenceCardView {
  title: string;
  isBaseline: boolean;
  score: number;
  headline: string;
  confidence: { level: ConfidenceLevel; label: string; reasons: string[] };
  why: string;
  evidence: readonly EvidenceItemView[];
  benefits: readonly string[];
  gaps: readonly string[];
  risks: readonly string[];
  contributions: readonly ContributionPart[];
}

export interface EvidenceCardProps {
  card: EvidenceCardView;
  labels: EvidenceCardLabels;
  /** Chart for an evidence item, shown when the farmer taps it; items without one have no button. */
  renderChart?: (item: EvidenceItemView) => ReactNode;
  /** Extra actions at the foot of the card, such as "Ask about this". */
  footer?: ReactNode;
  /** Extra context folded with the evidence, such as regional suitability. */
  extraDetails?: ReactNode;
  className?: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-body font-semibold text-ink">{title}</h4>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: readonly string[]; empty: string }) {
  if (items.length === 0) return <p className="text-ink-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-caption text-ink sm:text-body">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function EvidenceRow({
  item,
  labels,
  renderChart,
}: {
  item: EvidenceItemView;
  labels: EvidenceCardLabels;
  renderChart: EvidenceCardProps["renderChart"];
}) {
  const [open, setOpen] = useState(false);
  const chart = renderChart?.(item);
  return (
    <li className="space-y-1">
      <p className="text-ink">{item.sentence}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceChip
          source={item.source}
          resolution={item.resolution}
          period={item.period}
          labels={labels.provenance}
        />
        {chart ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "min-h-6 rounded-control px-2 text-caption text-accent underline",
              focusRing,
            )}
          >
            {open ? labels.hideChart : labels.showChart}
          </button>
        ) : null}
      </div>
      {chart && open ? <div className="pt-1">{chart}</div> : null}
    </li>
  );
}

/**
 * One rotation as an evidence card (F-08): why it is suggested, sourced evidence, benefits, gaps,
 * risks, score, resilience headline, confidence and per-criterion contributions. Pure: everything
 * comes in as props, so the assistant can render the same card from an answer.
 */
export function EvidenceCard({
  card,
  labels,
  renderChart,
  footer,
  extraDetails,
  className,
}: EvidenceCardProps) {
  return (
    <Card
      aria-label={card.title}
      className={cn(
        "flex h-full flex-col gap-3",
        card.isBaseline && "ring-1 ring-rain/40 ring-inset",
        className,
      )}
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body leading-snug font-semibold text-ink">{card.title}</h3>
          {card.isBaseline ? <Badge tone="info">{labels.baseline}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[2.5rem] leading-none font-bold tabular-nums text-ink">
              {card.score.toFixed(2)}
            </span>
            <span className="text-caption text-ink-muted">{labels.score}</span>
          </p>
          <ConfidenceBadge
            level={card.confidence.level}
            label={card.confidence.label}
            reasonsHeading={labels.confidenceHeading}
            reasons={card.confidence.reasons}
          />
        </div>
        <p className="text-body text-ink">{card.headline}</p>
        <p className="text-caption text-ink-muted">
          <span className="sr-only">{labels.why}: </span>
          {card.why}
        </p>
      </header>
      <ContributionBar
        parts={card.contributions}
        summary={`${labels.contributions}: ${card.score.toFixed(2)}`}
      />
      {/* Risks stay open (the first two at least): a local check must never hide behind a fold. */}
      <Risks
        items={card.risks}
        title={labels.risks}
        empty={labels.noRisks}
        more={labels.moreRisks}
      />
      <Disclosure
        summary={
          labels.details ??
          `${labels.evidence}, ${labels.benefits.toLowerCase()}, ${labels.gaps.toLowerCase()}`
        }
        count={card.evidence.length + card.benefits.length + card.gaps.length}
      >
        <div className="space-y-4">
          <Section title={`${labels.evidence} (${card.evidence.length})`}>
            <ul className="space-y-3">
              {card.evidence.map((item) => (
                <EvidenceRow key={item.id} item={item} labels={labels} renderChart={renderChart} />
              ))}
            </ul>
          </Section>
          <Section title={`${labels.benefits} (${card.benefits.length})`}>
            <List items={card.benefits} empty="" />
          </Section>
          <Section title={`${labels.gaps} (${card.gaps.length})`}>
            <List items={card.gaps} empty={labels.noGaps} />
          </Section>
          {extraDetails}
        </div>
      </Disclosure>
      {footer ? <footer className="mt-auto">{footer}</footer> : null}
    </Card>
  );
}

const RISKS_SHOWN = 2;

function Risks({
  items,
  title,
  empty,
  more,
}: {
  items: readonly string[];
  title: string;
  empty: string;
  more: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, RISKS_SHOWN);
  const hidden = items.length - shown.length;
  return (
    <section className="space-y-1 rounded-panel border border-warn-ink/30 bg-warn-soft/50 px-4 py-3">
      <h4 className="flex items-center gap-2 text-caption font-semibold text-warn-ink">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4 shrink-0">
          <path
            d="M10 3 2.5 16.5h15L10 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 8.5v3.5M10 14.2v.3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {title}
        {items.length > 0 ? <span className="font-normal">({items.length})</span> : null}
      </h4>
      <List items={shown} empty={empty} />
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-caption font-semibold text-warn-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {(more ?? "Show {n} more").replace("{n}", String(hidden))}
        </button>
      ) : null}
    </section>
  );
}
