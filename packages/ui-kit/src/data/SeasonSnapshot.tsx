import type { ReactNode } from "react";
import { cn } from "../cn";
import { Badge } from "../components/Badge";

export interface SeasonSnapshotRow {
  id: string;
  name: string;
  isBaseline: boolean;
  crop: string;
  /** The season's composite score for this rotation. */
  score: number;
  /** Monte Carlo band of the score, when there is one. */
  band?: { p10: number; p90: number } | null;
}

export interface SeasonSnapshotProps {
  /** Season label such as `2021-22`. */
  season: string;
  rows: readonly SeasonSnapshotRow[];
  labels: {
    /** Heading, e.g. "Season 2021-22". */
    heading: string;
    score: string;
    /** Formats the band, e.g. "likely 0.60 to 0.71". */
    band: (p10: string, p90: string) => string;
    baseline: string;
    /** Shown on the lowest-scoring season, e.g. "Hardest season on record". */
    worst?: string;
  };
  isWorst?: boolean;
  /** Extra content under the table, e.g. the counterfactual note. */
  children?: ReactNode;
  className?: string;
}

/** How each rotation did in one season: crop, score and the Monte Carlo range of that score. */
export function SeasonSnapshot({
  season: _season,
  rows,
  labels,
  isWorst,
  children,
  className,
}: SeasonSnapshotProps) {
  return (
    <section aria-label={labels.heading} className={cn("space-y-2", className)}>
      <h4 className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
        {labels.heading}
        {isWorst && labels.worst ? <Badge tone="warn">{labels.worst}</Badge> : null}
      </h4>
      <table className="w-full border-collapse text-left text-caption">
        <thead className="sr-only">
          <tr>
            <th scope="col">{labels.heading}</th>
            <th scope="col">{labels.score}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line-soft last:border-0">
              <th scope="row" className="py-1.5 pr-2 font-medium text-ink">
                {row.name}
                {row.isBaseline ? (
                  <span className="ml-1 text-ink-muted">({labels.baseline})</span>
                ) : null}
                <span className="block font-normal text-ink-muted">{row.crop}</span>
              </th>
              <td className="py-1.5 text-right tabular-nums text-ink">
                <span className="font-semibold">{row.score.toFixed(2)}</span>
                {row.band ? (
                  <span className="block font-normal text-ink-muted">
                    {labels.band(row.band.p10.toFixed(2), row.band.p90.toFixed(2))}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </section>
  );
}
