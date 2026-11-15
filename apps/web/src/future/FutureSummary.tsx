import { Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { direction, type Headline, percent } from "./analysis";

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
    <Card
      className={lead ? "min-w-0 border-l-4 border-l-good-ink sm:col-span-2" : "min-w-0"}
      title={detail ? `${label}: ${value}. ${detail}` : `${label}: ${value}`}
    >
      <p className="text-caption font-semibold text-ink-muted">{label}</p>
      <p
        className={[
          "mt-1 line-clamp-2 font-bold leading-snug break-words",
          lead ? "text-title" : "text-body",
          tone === "risk" ? "text-risk-ink" : tone === "good" ? "text-good-ink" : "text-ink",
        ].join(" ")}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 line-clamp-2 text-caption text-ink-muted">{detail}</p> : null}
    </Card>
  );
}

/** How a change reads in a sentence: "about the same", "5% worse", "3% better". */
function changeWords(change: number): string {
  const dir = direction(change);
  if (dir === "flat") return fmt(t("future.kpi.same"), { change: percent(change) });
  return fmt(t(dir === "down" ? "future.kpi.worse" : "future.kpi.better"), {
    change: percent(Math.abs(change)).replace("+", ""),
  });
}

/** The answer first: which rotation to keep, how the climate changes, who loses, and your own. */
export function FutureSummary({
  headline,
  nameOf,
}: {
  headline: Headline;
  /** Short, distinguishing rotation names (see `shortNames`). */
  nameOf: (id: string) => string;
}) {
  const { best, bestEverywhere, largestLoss, current, warmingC, rainPct } = headline;
  return (
    <section
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label={t("future.kpi.best")}
    >
      <Tile
        lead
        label={t("future.kpi.best")}
        value={best ? nameOf(best.id) : "-"}
        detail={t(bestEverywhere ? "future.kpi.bestEverywhere" : "future.kpi.bestHere")}
      />
      {warmingC !== null ? (
        <Tile
          label={t("future.kpi.climate")}
          value={fmt(t("future.kpi.climate.value"), {
            temp: `${warmingC >= 0 ? "+" : "−"}${Math.abs(warmingC).toFixed(1)} °C`,
          })}
          {...(rainPct !== null
            ? { detail: fmt(t("future.kpi.climate.rain"), { rain: percent(rainPct) }) }
            : {})}
        />
      ) : null}
      <Tile
        label={t("future.kpi.loss")}
        value={largestLoss ? nameOf(largestLoss.id) : t("future.kpi.loss.none")}
        {...(largestLoss
          ? { detail: changeWords(largestLoss.change.median), tone: "risk" as const }
          : {})}
      />
      {current ? (
        <Tile
          label={t("future.kpi.current")}
          value={changeWords(current.change.median)}
          detail={nameOf(current.id)}
          {...(direction(current.change.median) === "down" ? { tone: "risk" as const } : {})}
        />
      ) : null}
    </section>
  );
}
