import { Badge, Card, ProvenanceChip } from "@itza/ui-kit";
import type { ReactNode } from "react";
import { t } from "../copy";
import { fmt, formatDate, formatDistance } from "../lib/format";
import { assetUrl, type Snapshot, type Source } from "./service";
import { useGedi, useGrace, useScenes } from "./useContext";

const num = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const labels = {
  source: t("context.provenance.source"),
  resolution: t("context.provenance.resolution"),
  period: t("context.provenance.period"),
};

function resolution(meters: number): string {
  const d = formatDistance(meters);
  return `${d.value} ${d.unit}`;
}

function Chip({ source }: { source: Source }) {
  return (
    <ProvenanceChip
      source={`${source.source} · ${source.product} ${source.version}`}
      resolution={resolution(source.resolution_m)}
      period={`${formatDate(source.period.start)} to ${formatDate(source.period.end)}`}
      labels={labels}
    />
  );
}

const muted = (text: string) => <p className="text-caption text-ink-muted">{text}</p>;

/** Loading, failure and pending states shared by every context block. */
function state(query: { isError: boolean; data?: { status: string } | undefined }): ReactNode {
  if (query.isError) return muted(t("context.failed"));
  if (!query.data || query.data.status === "pending") return muted(t("context.pending"));
  return null;
}

function SnapshotItem({ scene }: { scene: Snapshot }) {
  const { stats, quality, smap } = scene;
  const flags = Object.entries(quality.flags)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
  return (
    <li className="space-y-1 rounded-card border border-line-soft p-2">
      <img
        src={assetUrl(scene.href)}
        alt={fmt(t("context.nisar.alt"), { date: formatDate(scene.date) })}
        className="h-32 w-full rounded-control object-contain"
        loading="lazy"
      />
      <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
        {formatDate(scene.date)}
        {scene.provisional ? <Badge tone="warn">{t("context.nisar.provisional")}</Badge> : null}
      </p>
      <p className="text-caption text-ink">
        {fmt(t("context.nisar.mean"), {
          mean: num.format(stats.mean),
          min: num.format(stats.minimum),
          max: num.format(stats.maximum),
          unit: stats.unit,
        })}
      </p>
      <p className="text-caption text-ink-muted">
        {fmt(t("context.nisar.quality"), {
          valid: quality.valid_pixels,
          total: quality.total_pixels,
          policy: quality.policy,
        })}
      </p>
      {flags ? muted(fmt(t("context.nisar.flags"), { flags })) : null}
      <p className="text-caption text-ink">
        {smap && smap.value !== null
          ? fmt(t("context.nisar.smap"), {
              date: formatDate(smap.date),
              value: num.format(smap.value),
              unit: smap.unit,
            })
          : fmt(t("context.nisar.smap.none"), { note: smap?.coverage_note ?? "" })}
      </p>
      <Chip source={scene.provenance} />
    </li>
  );
}

/** NISAR snapshots with quality and the same-date SMAP value (F-18). */
export function NisarPanel() {
  const query = useScenes("nisar");
  const data = query.data;
  return (
    <Card className="space-y-2">
      <h3 className="text-title font-semibold text-ink">{t("context.nisar.title")}</h3>
      {muted(t("context.nisar.intro"))}
      {state(query) ??
        (data && data.scenes.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {data.scenes.map((scene) => (
              <SnapshotItem key={`${scene.date}-${scene.href}`} scene={scene} />
            ))}
          </ul>
        ) : (
          muted(fmt(t("context.nisar.empty"), { note: data?.coverage_note ?? "" }))
        ))}
    </Card>
  );
}

/** One landscape card: data date, resolution, coverage note and a one-sentence takeaway. */
function ContextCard({
  date,
  meters,
  coverage,
  takeaway,
  source,
}: {
  date: string | null;
  meters: number | null;
  coverage: string;
  takeaway: string | null;
  source: Source | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-body text-ink">{takeaway ?? t("context.missing")}</p>
      {date ? muted(fmt(t("context.date"), { date: formatDate(date) })) : null}
      {meters ? muted(fmt(t("context.resolution"), { resolution: resolution(meters) })) : null}
      {muted(coverage)}
      {source ? <Chip source={source} /> : null}
    </div>
  );
}

function GraceCard() {
  const query = useGrace();
  const d = query.data;
  const last = d?.series.filter((p) => p.anomaly_cm !== null).at(-1);
  const trend = d?.trend_cm_per_year ?? null;
  const takeaway =
    trend === null
      ? (d?.message ?? null)
      : Math.abs(trend) < 0.1
        ? t("context.grace.stable")
        : fmt(t(trend < 0 ? "context.grace.falling" : "context.grace.rising"), {
            trend: num.format(Math.abs(trend)),
          });
  return (
    <Card className="space-y-2">
      <h3 className="text-title font-semibold text-ink">{t("context.grace.title")}</h3>
      {state(query) ?? (
        <ContextCard
          date={last?.date ?? null}
          meters={d?.provenance?.resolution_m ?? null}
          coverage={d?.coverage_note ?? ""}
          takeaway={takeaway}
          source={d?.provenance ?? null}
        />
      )}
    </Card>
  );
}

function GediCard() {
  const query = useGedi();
  const d = query.data;
  const dates = (d?.features ?? []).map((f) => f.properties.date).sort();
  const height =
    d?.height_mean_m != null
      ? fmt(t("context.gedi.height"), {
          height: num.format(d.height_mean_m),
          count: d.features.length,
        })
      : "";
  return (
    <Card className="space-y-2">
      <h3 className="text-title font-semibold text-ink">{t("context.gedi.title")}</h3>
      {state(query) ?? (
        <ContextCard
          date={dates.at(-1) ?? null}
          meters={d?.provenance[0]?.resolution_m ?? null}
          coverage={d?.coverage_note ?? ""}
          takeaway={d && d.features.length > 0 ? `${height} ${d.tree_structure_hint}`.trim() : null}
          source={d?.provenance[0] ?? null}
        />
      )}
    </Card>
  );
}

function EcostressCard() {
  const query = useScenes("ecostress");
  const d = query.data;
  const latest = d?.scenes.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1);
  const takeaway = latest
    ? fmt(t(latest.variable === "esi" ? "context.ecostress.esi" : "context.ecostress.lst"), {
        mean: num.format(latest.stats.mean),
        unit: latest.stats.unit,
      })
    : null;
  return (
    <Card className="space-y-2">
      <h3 className="text-title font-semibold text-ink">{t("context.ecostress.title")}</h3>
      {state(query) ?? (
        <ContextCard
          date={latest?.date ?? null}
          meters={latest?.provenance.resolution_m ?? null}
          coverage={d?.coverage_note ?? ""}
          takeaway={takeaway}
          source={latest?.provenance ?? null}
        />
      )}
    </Card>
  );
}

/** Landscape context around the field (F-19): GRACE, GEDI and ECOSTRESS. */
export function ContextCards() {
  return (
    <div className="space-y-3">
      <GraceCard />
      <GediCard />
      <EcostressCard />
    </div>
  );
}
