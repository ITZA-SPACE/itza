import { type ReactNode, useState } from "react";
import { cn, focusRing } from "../cn";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { ConfidenceBadge, type ConfidenceLevel } from "../components/ConfidenceBadge";
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
  /** Extra actions at the foot of the card, such as "Why not…?". */
  footer?: ReactNode;
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
    <ul className="list-disc space-y-1 pl-5 text-ink">
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
export function EvidenceCard({ card, labels, renderChart, footer, className }: EvidenceCardProps) {
  return (
    <Card
      aria-label={card.title}
      className={cn(
        "flex h-full flex-col gap-4",
        card.isBaseline && "ring-1 ring-rain/40 ring-inset",
        className,
      )}
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-title font-semibold text-ink">{card.title}</h3>
          {card.isBaseline ? <Badge tone="info">{labels.baseline}</Badge> : null}
        </div>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-[3rem] leading-none font-bold tabular-nums text-ink">
            {card.score.toFixed(2)}
          </span>
          <span className="text-caption text-ink-muted">{labels.score}</span>
        </p>
        <p className="text-body text-ink">{card.headline}</p>
        <ConfidenceBadge
          level={card.confidence.level}
          label={card.confidence.label}
          reasonsHeading={labels.confidenceHeading}
          reasons={card.confidence.reasons}
        />
      </header>
      <ContributionBar
        parts={card.contributions}
        summary={`${labels.contributions}: ${card.score.toFixed(2)}`}
      />
      <Section title={labels.why}>
        <p className="text-ink">{card.why}</p>
      </Section>
      <Section title={labels.evidence}>
        <ul className="space-y-3">
          {card.evidence.map((item) => (
            <EvidenceRow key={item.id} item={item} labels={labels} renderChart={renderChart} />
          ))}
        </ul>
      </Section>
      <Section title={labels.benefits}>
        <List items={card.benefits} empty="" />
      </Section>
      <Section title={labels.gaps}>
        <List items={card.gaps} empty={labels.noGaps} />
      </Section>
      <Section title={labels.risks}>
        <List items={card.risks} empty={labels.noRisks} />
      </Section>
      {footer ? <footer className="mt-auto pt-2">{footer}</footer> : null}
    </Card>
  );
}
