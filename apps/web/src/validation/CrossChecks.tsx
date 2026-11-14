import { Card, TableScroll } from "@itza/ui-kit";
import { type CopyKey, hasCopy, t } from "../copy";
import { fmt } from "../lib/format";
import artifact from "./data/cross-checks.json";

type Check = (typeof artifact.fields)[number]["checks"][number];
type Kind = "prism" | "openet" | "quickstats";
const kinds: readonly Kind[] = ["prism", "openet", "quickstats"];
const title: Record<Kind, CopyKey> = {
  prism: "validation.cross.prism",
  openet: "validation.cross.openet",
  quickstats: "validation.cross.quickstats",
};
const caveat: Record<Kind, CopyKey> = {
  prism: "validation.cross.rainCaveat",
  openet: "validation.cross.etCaveat",
  quickstats: "validation.cross.directional",
};
const number = (value: number | null) =>
  value === null ? t("validation.cross.undefined") : value.toFixed(3);

function CheckCard({ check, kind }: { check: Check; kind: Kind }) {
  const source = artifact.sources[kind];
  const stats = check.statistics;
  const reason = `validation.cross.${check.reason}`;
  return (
    <div className="min-w-0 space-y-2 border-t border-line-soft pt-3">
      <h4 className="text-body font-semibold text-ink">{t(title[kind])}</h4>
      <p className="text-caption text-ink-muted">{t(caveat[kind])}</p>
      {check.status === "ready" ? (
        <>
          <p className="text-caption text-ink">
            {fmt(t("validation.cross.period"), {
              period: check.period ?? t("validation.cross.none"),
            })}
          </p>
          {kind !== "quickstats" ? (
            <p className="text-body text-ink">
              {fmt(
                t(
                  kind === "prism"
                    ? "validation.cross.rainErrorMetrics"
                    : "validation.cross.errorMetrics",
                ),
                {
                  bias: number(stats.bias),
                  rmse: number(stats.rmse),
                },
              )}
            </p>
          ) : null}
          <p className="text-body text-ink">
            {fmt(t("validation.cross.rank"), { rho: number(stats.spearman) })}
          </p>
          {kind === "quickstats" ? (
            <p className="text-body text-ink">
              {fmt(t("validation.cross.direction"), {
                agree: stats.direction_agree,
                total: stats.direction_n,
                ties: stats.direction_ties,
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-body text-risk-ink">
          {hasCopy(reason) ? t(reason) : t("validation.cross.noOverlap")}
        </p>
      )}
      <p className="text-caption text-ink-muted">
        {fmt(t("validation.cross.coverage"), {
          count: stats.n,
          unmatched: check.unmatched_n,
          reference: check.reference_n,
        })}
      </p>
      <p className="text-caption text-ink-muted">
        {fmt(t("validation.cross.reference"), {
          source: source.name,
          resolution: check.reference.resolution,
          period: check.reference_period ?? t("validation.cross.none"),
          retrieved: check.reference.retrieved,
        })}
      </p>
      {check.itza ? (
        <p className="text-caption text-ink-muted">
          {fmt(t(kind === "prism" ? "validation.cross.rainSource" : "validation.cross.model"), {
            source: check.itza.source,
            resolution: check.itza.resolution,
            retrieved: "retrieved" in check.itza ? check.itza.retrieved : "",
          })}
        </p>
      ) : null}
      <p className="break-words text-caption text-ink-muted">
        <a href={source.url} className="underline">
          {source.citation}
        </a>{" "}
        <a href={source.license_url} className="underline">
          {fmt(t("validation.cross.license"), { license: source.license })}
        </a>
      </p>
      {kind === "prism" ? (
        <p className="break-words text-caption text-ink-muted">
          <a href={artifact.sources.imerg_monthly.url} className="underline">
            {artifact.sources.imerg_monthly.citation}
          </a>{" "}
          <a href={artifact.sources.imerg_monthly.license_url} className="underline">
            {fmt(t("validation.cross.license"), {
              license: artifact.sources.imerg_monthly.license,
            })}
          </a>
        </p>
      ) : null}
      {check.rows.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-caption text-ink underline">
            {t("validation.cross.details")}
          </summary>
          <p className="text-caption text-ink-muted">
            {t(
              kind === "quickstats" ? "validation.cross.unitsYield" : "validation.cross.unitsWater",
            )}
          </p>
          <TableScroll label={t(title[kind])}>
            <table className="w-full text-left text-caption tabular-nums">
              <caption className="sr-only">{t(title[kind])}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    {t("validation.cross.columnPeriod")}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {t(
                      kind === "prism"
                        ? "validation.cross.columnImerg"
                        : "validation.cross.columnItza",
                    )}
                  </th>
                  <th scope="col" className="py-1">
                    {t("validation.cross.columnReference")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {check.rows.map((row) => (
                  <tr key={row.period}>
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {row.period}
                    </th>
                    <td className="py-1 pr-3">{number(row.itza)}</td>
                    <td className="py-1">{number(row.reference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </details>
      ) : null}
    </div>
  );
}

/** Bundled at build time so these checks work even when other proof-field data cannot load. */
export function CrossChecks() {
  return (
    <section className="space-y-3" aria-labelledby="cross-check-title">
      <h2 id="cross-check-title" className="text-title font-semibold text-ink">
        {t("validation.cross.title")}
      </h2>
      <p className="text-body text-ink-muted">{t("validation.cross.intro")}</p>
      <div className="grid gap-3 xl:grid-cols-3">
        {artifact.fields.map((field) => {
          const name = `hero.name.${field.id}`;
          return (
            <Card key={field.id} className="min-w-0 space-y-3">
              <h3 className="text-body font-semibold text-ink">
                {hasCopy(name) ? t(name) : field.id}
              </h3>
              {kinds.map((kind) => {
                const check = field.checks.find((c) => c.kind === kind);
                return check ? <CheckCard key={kind} check={check} kind={kind} /> : null;
              })}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
