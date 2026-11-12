import { Badge, Button, Card, EmptyState, ProvenanceChip, Skeleton } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import { chipFields, chipLabels } from "../lib/provenance";
import { flagText, type Level } from "./agreement";
import { type ArenaRow, type ArenaState, useArena } from "./useArena";

const MODEL_CARD = "https://github.com/ITZA-SPACE/itza/blob/main/pipelines/ml/MODEL_CARD.md";
const TOP_DRIVERS = 5;
const LEVEL_KEY: Record<Level, CopyKey> = {
  0: "arena.level.0",
  1: "arena.level.1",
  2: "arena.level.2",
};
const sign = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

/** A level in words, never by colour alone. */
function Level_({ level }: { level: Level | undefined }) {
  if (level === undefined) return <span className="text-ink-muted">{t("arena.none")}</span>;
  return <Badge tone={level === 2 ? "warn" : "neutral"}>{t(LEVEL_KEY[level])}</Badge>;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

function Opinions({ row, sources }: { row: ArenaRow; sources: ArenaState["sources"] }) {
  const { ml } = row;
  const labels = chipLabels();
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="space-y-2">
        <h3 className="text-body font-semibold text-ink">{t("arena.rule.title")}</h3>
        <Level_ level={row.levels.rule} />
        <p className="text-body text-ink-muted">
          {row.ruleStress === null
            ? t("arena.rule.none")
            : fmt(t("arena.rule.body"), { stress: percent(row.ruleStress) })}
        </p>
        {row.ruleStress !== null && sources.weather ? (
          <ProvenanceChip {...chipFields(sources.weather)} labels={labels} />
        ) : null}
      </Card>
      <Card className="space-y-2">
        <h3 className="text-body font-semibold text-ink">{t("arena.ml.title")}</h3>
        <Level_ level={row.levels.ml} />
        {ml ? (
          <>
            <p className="text-body text-ink-muted">
              {fmt(t("arena.ml.body"), { z: sign(ml.prediction) })}
            </p>
            <h4 className="text-caption font-medium text-ink">{t("arena.ml.drivers")}</h4>
            <ul className="space-y-1 text-caption text-ink-muted">
              {ml.drivers.slice(0, TOP_DRIVERS).map((d) => (
                <li key={d.feature}>
                  {fmt(t("arena.ml.driver"), {
                    feature: driverName(d.feature),
                    shap: sign(d.shap_value),
                    direction: t(d.shap_value < 0 ? "arena.ml.lowers" : "arena.ml.raises"),
                  })}
                </li>
              ))}
            </ul>
            {ml.model.provenance[0] ? (
              <ProvenanceChip {...ml.model.provenance[0]} labels={labels} />
            ) : null}
          </>
        ) : (
          <p role="status" className="text-body text-ink-muted">
            {t(`arena.ml.${row.mlStatus}` as CopyKey)}
          </p>
        )}
      </Card>
      <Card className="space-y-2">
        <h3 className="text-body font-semibold text-ink">{t("arena.sat.title")}</h3>
        <Level_ level={row.levels.sat} />
        <p className="text-body text-ink-muted">
          {row.ndviZ === null
            ? t("arena.sat.noNdvi")
            : fmt(t("arena.sat.ndvi"), {
                peak: (row.ndviPeak ?? 0).toFixed(2),
                z: sign(row.ndviZ),
              })}
        </p>
        {row.ndviZ !== null && sources.ndvi ? (
          <ProvenanceChip {...chipFields(sources.ndvi)} labels={labels} />
        ) : null}
        <p className="text-body text-ink-muted">
          {row.smapZ === null
            ? t("arena.sat.noSmap")
            : fmt(t("arena.sat.smap"), { z: sign(row.smapZ) })}
        </p>
        {row.smapZ !== null && sources.smap ? (
          <ProvenanceChip {...chipFields(sources.smap)} labels={labels} />
        ) : null}
      </Card>
    </div>
  );
}

/** "mid_rain_mm" to "rain in the middle stage". */
function driverName(feature: string): string {
  const stage = /^(initial|development|mid|late)_(.+)$/.exec(feature);
  const key = `arena.feature.${stage ? (stage[2] as string) : feature}` as CopyKey;
  const name = t(key);
  return stage
    ? fmt(t("arena.feature.stage"), { name, stage: t(`arena.stage.${stage[1]}` as CopyKey) })
    : name;
}

/** The Model Arena (F-16): three opinions of every season, how far they agree, and where they do not. */
export function ArenaStep({ initialSeason }: { initialSeason?: string } = {}) {
  const arena = useArena();
  const [chosen, setChosen] = useState<string | null>(initialSeason ?? null);

  if (arena.status === "no-field") {
    return (
      <EmptyState
        title={t("flow.needField")}
        action={
          <Button asChild>
            <Link to="/field">{t("flow.toField")}</Link>
          </Button>
        }
      />
    );
  }
  if (arena.status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-body text-ink-muted">
          {t("arena.loading")}
        </p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (arena.status === "no-data" || arena.rows.length === 0) {
    return <EmptyState title={t("arena.empty.title")} description={t("arena.empty.body")} />;
  }

  const row =
    arena.rows.find((r) => r.label === chosen) ??
    arena.rows.find((r) => r.label === arena.worstSeason) ??
    (arena.rows.at(-1) as ArenaRow);
  const flags = arena.rows.flatMap((r) => r.flags);
  return (
    <div className="space-y-6">
      <section aria-labelledby="arena-matrix" className="space-y-2">
        <h2 id="arena-matrix" className="text-title font-semibold text-ink">
          {t("arena.matrix.title")}
        </h2>
        <p className="text-body text-ink-muted">
          {arena.meanScore === null
            ? t("arena.matrix.noScore")
            : fmt(t("arena.matrix.score"), { score: percent(arena.meanScore) })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <caption className="sr-only">{t("arena.matrix.caption")}</caption>
            <thead>
              <tr className="text-ink-muted">
                {(["season", "rule", "ml", "sat", "agree"] as const).map((c) => (
                  <th key={c} scope="col" className="py-1 pr-3 font-medium">
                    {t(`arena.col.${c}` as CopyKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arena.rows.map((r) => (
                <tr
                  key={r.label}
                  className="border-t border-line-soft"
                  aria-current={r.label === row.label ? "true" : undefined}
                >
                  <th scope="row" className="py-1 pr-3 font-medium text-ink">
                    <Button variant="ghost" onClick={() => setChosen(r.label)}>
                      {r.label}
                    </Button>
                  </th>
                  <td className="py-1 pr-3">
                    <Level_ level={r.levels.rule} />
                  </td>
                  <td className="py-1 pr-3">
                    <Level_ level={r.levels.ml} />
                  </td>
                  <td className="py-1 pr-3">
                    <Level_ level={r.levels.sat} />
                  </td>
                  <td className="py-1 pr-3">
                    {r.score === null ? t("arena.none") : percent(r.score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="arena-season" className="space-y-3">
        <h2 id="arena-season" className="text-title font-semibold text-ink">
          {fmt(t("arena.season.title"), { season: row.label })}
        </h2>
        <p className="text-body text-ink-muted">
          {row.score === null
            ? t("arena.matrix.noScore")
            : fmt(t("arena.season.score"), { score: percent(row.score) })}
        </p>
        <Opinions row={row} sources={arena.sources} />
      </section>

      <section aria-labelledby="arena-flags" className="space-y-2">
        <h2 id="arena-flags" className="text-title font-semibold text-ink">
          {t("arena.flags.title")}
        </h2>
        {flags.length === 0 ? (
          <p className="text-body text-ink-muted">{t("arena.flags.none")}</p>
        ) : (
          <>
            <p className="text-body text-ink-muted">{t("arena.flags.body")}</p>
            <ul className="space-y-2">
              {flags.map((f) => (
                <li
                  key={`${f.season}-${f.stressed}-${f.calm}`}
                  className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink"
                >
                  {flagText(f)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="text-caption text-ink-muted">
        {t("arena.honest")}{" "}
        <a
          className="text-accent-strong underline"
          href={MODEL_CARD}
          target="_blank"
          rel="noreferrer"
        >
          {t("arena.modelCard")}
        </a>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link to="/climate">{t("arena.toClimate")}</Link>
        </Button>
        <Button asChild>
          <Link to="/compare">{t("arena.toCompare")}</Link>
        </Button>
      </div>
    </div>
  );
}
