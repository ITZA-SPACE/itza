import { Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { type Headline, percent } from "./analysis";

function Tile({
  label,
  value,
  detail,
  tone,
  lead,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "risk" | "good";
  lead?: boolean;
}) {
  return (
    <Card className={lead ? "border-l-4 border-l-good-ink sm:col-span-2" : ""}>
      <p className="text-caption font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p
        className={[
          "mt-1 font-bold tabular-nums",
          lead ? "text-body leading-snug" : "text-title",
          tone === "risk" ? "text-risk-ink" : tone === "good" ? "text-good-ink" : "text-ink",
        ].join(" ")}
      >
        {value}
      </p>
      {detail ? <p className="mt-0.5 text-caption text-ink-muted">{detail}</p> : null}
    </Card>
  );
}

/** The answer first: the most robust rotation and the few numbers that explain the 2050 picture. */
export function FutureSummary({
  headline,
  total,
  nameOf,
}: {
  headline: Headline;
  total: number;
  /** Short, distinguishing rotation names (see `shortNames`). */
  nameOf: (id: string) => string;
}) {
  const { best, bestEverywhere, largestLoss, rankMoves, warmingC, rainPct } = headline;
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label={t("future.kpi.best")}>
      <Tile
        lead
        label={t("future.kpi.best")}
        value={best ? nameOf(best.id) : "-"}
        detail={t(bestEverywhere ? "future.kpi.bestEverywhere" : "future.kpi.bestHere")}
      />
      {warmingC !== null ? (
        <Tile
          label={t("future.kpi.warming")}
          value={`${warmingC >= 0 ? "+" : "−"}${Math.abs(warmingC).toFixed(1)} °C`}
          detail={
            rainPct !== null
              ? `${t("future.kpi.rain")} ${percent(rainPct)} · ${t("future.kpi.warming.detail")}`
              : t("future.kpi.warming.detail")
          }
        />
      ) : null}
      <Tile
        label={t("future.kpi.loss")}
        value={largestLoss ? percent(largestLoss.change.median) : t("future.kpi.loss.none")}
        {...(largestLoss ? { detail: nameOf(largestLoss.id), tone: "risk" as const } : {})}
      />
      <Tile
        label={t("future.kpi.moves")}
        value={fmt(t("future.kpi.moves.value"), { moves: rankMoves, total })}
      />
    </section>
  );
}
