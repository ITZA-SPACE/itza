import { Badge, Card, Disclosure, TableScroll } from "@itza/ui-kit";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-0.5 rounded-panel border border-line-soft bg-glass px-3 py-2">
      <dt className="text-[0.75rem] leading-4 text-ink-muted">{label}</dt>
      <dd className="font-display text-body font-bold whitespace-nowrap text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function CheckCard({ check, kind }: { check: Check; kind: Kind }) {
  const source = artifact.sources[kind];
  const stats = check.statistics;
  const reason = `validation.cross.${check.reason}`;
  const ready = check.status === "ready";
  return (
    <div className="min-w-0 space-y-3 border-t border-line-soft pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-body font-semibold text-ink">{t(title[kind])}</h4>
        <Badge tone={ready ? "info" : "warn"}>
          {t(ready ? "validation.cross.compared" : "validation.cross.notCompared")}
        </Badge>
      </div>
      {ready ? (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kind !== "quickstats" ? (
              <>
                <Stat label={t("validation.cross.stat.bias")} value={number(stats.bias)} />
                <Stat label={t("validation.cross.stat.rmse")} value={number(stats.rmse)} />
              </>
            ) : (
              <Stat
                label={t("validation.cross.stat.direction")}
                value={`${stats.direction_agree} / ${stats.direction_n}`}
              />
            )}
            <Stat label={t("validation.cross.stat.rho")} value={number(stats.spearman)} />
          </dl>
          <p className="text-caption text-ink-muted">
            {fmt(t("validation.cross.period"), {
              period: check.period ?? t("validation.cross.none"),
            })}
          </p>
        </>
      ) : (
        <p className="text-caption text-warn-ink">
          {hasCopy(reason) ? t(reason) : t("validation.cross.noOverlap")}
        </p>
      )}
      <Disclosure summary={t("validation.cross.method")}>
        <div className="space-y-2 text-caption text-ink-muted">
          <p>{t(caveat[kind])}</p>
          {ready && kind !== "quickstats" ? (
            <p>
              {fmt(
                t(
                  kind === "prism"
                    ? "validation.cross.rainErrorMetrics"
                    : "validation.cross.errorMetrics",
                ),
                { bias: number(stats.bias), rmse: number(stats.rmse) },
              )}
            </p>
          ) : null}
          {ready ? <p>{fmt(t("validation.cross.rank"), { rho: number(stats.spearman) })}</p> : null}
          {ready && kind === "quickstats" ? (
            <p>
              {fmt(t("validation.cross.direction"), {
                agree: stats.direction_agree,
                total: stats.direction_n,
                ties: stats.direction_ties,
              })}
            </p>
          ) : null}
          <p>
            {fmt(t("validation.cross.coverage"), {
              count: stats.n,
              unmatched: check.unmatched_n,
              reference: check.reference_n,
            })}
          </p>
          <p>
            {fmt(t("validation.cross.reference"), {
              source: source.name,
              resolution: check.reference.resolution,
              period: check.reference_period ?? t("validation.cross.none"),
              retrieved: check.reference.retrieved,
            })}
          </p>
          {check.itza ? (
            <p>
              {fmt(t(kind === "prism" ? "validation.cross.rainSource" : "validation.cross.model"), {
                source: check.itza.source,
                resolution: check.itza.resolution,
                retrieved: "retrieved" in check.itza ? check.itza.retrieved : "",
              })}
            </p>
          ) : null}
          <p className="break-words">
            <a href={source.url} className="underline">
              {source.citation}
            </a>{" "}
            <a href={source.license_url} className="underline">
              {fmt(t("validation.cross.license"), { license: source.license })}
            </a>
          </p>
          {kind === "prism" ? (
            <p className="break-words">
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
            <>
              <p>
                {t(
                  kind === "quickstats"
                    ? "validation.cross.unitsYield"
                    : "validation.cross.unitsWater",
                )}
              </p>
              <TableScroll label={t(title[kind])}>
                <table className="w-full text-left text-caption text-ink tabular-nums">
                  <caption className="sr-only">{t(title[kind])}</caption>
                  <thead>
                    <tr className="text-ink-muted">
                      <th scope="col">{t("validation.cross.columnPeriod")}</th>
                      <th scope="col">
                        {t(
                          kind === "prism"
                            ? "validation.cross.columnImerg"
                            : "validation.cross.columnItza",
                        )}
                      </th>
                      <th scope="col">{t("validation.cross.columnReference")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.rows.map((row) => (
                      <tr key={row.period} className="border-t border-line-soft">
                        <th scope="row" className="font-normal">
                          {row.period}
                        </th>
                        <td>{number(row.itza)}</td>
                        <td>{number(row.reference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </>
          ) : null}
        </div>
      </Disclosure>
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
