import { ProvenanceChip } from "@itza/ui-kit";
import { Droplets, Gauge, Sprout, Thermometer } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../copy";
import { fmt, formatDate, formatDistance } from "../lib/format";
import type { Source } from "./service";
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

/** The source as a small round icon; tapping it shows source, resolution, period and any caveat. */
function Chip({ source, detail }: { source: Source; detail?: string }) {
  return (
    <ProvenanceChip
      compact
      source={`${source.source} · ${source.product} ${source.version}`}
      resolution={resolution(source.resolution_m)}
      period={`${formatDate(source.period.start)} to ${formatDate(source.period.end)}`}
      labels={labels}
      {...(detail ? { detail } : {})}
    />
  );
}

/** Surface temperature arrives in kelvin; a farmer reads Celsius. */
function temperature(mean: number, unit: string): string {
  return unit === "K" ? `${num.format(mean - 273.15)} °C` : `${num.format(mean)} ${unit}`;
}

/** One context reading: icon, name, one short line and the source icon. Caveats wait in the source. */
function Row({
  icon,
  title,
  children,
  source,
  detail,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  source: Source | null;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-panel border border-line-soft bg-glass px-3 py-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-rim text-rain [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption text-ink-muted">{title}</p>
        <div className="text-body font-semibold text-ink">{children}</div>
      </div>
      {source ? <Chip source={source} {...(detail ? { detail } : {})} /> : null}
    </li>
  );
}

const muted = (text: string) => <span className="font-normal text-ink-muted">{text}</span>;

/** Loading, failure and pending states shared by every context block. */
function state(query: { isError: boolean; data?: { status: string } | undefined }): ReactNode {
  if (query.isError) return muted(t("context.failed"));
  if (!query.data || query.data.status === "pending") return muted(t("context.pending"));
  return null;
}

/** NISAR soil moisture (F-18): the latest snapshot's mean, with quality and SMAP in its source. */
export function NisarPanel() {
  const query = useScenes("nisar");
  const data = query.data;
  const scene = data?.scenes.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1);
  const detail = scene
    ? [
        fmt(t("context.nisar.quality"), {
          valid: scene.quality.valid_pixels,
          total: scene.quality.total_pixels,
          policy: scene.quality.policy,
        }),
        scene.smap && scene.smap.value !== null
          ? fmt(t("context.nisar.smap"), {
              date: formatDate(scene.smap.date),
              value: num.format(scene.smap.value),
              unit: scene.smap.unit,
            })
          : "",
        scene.provisional ? t("context.nisar.provisional") : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      <Row
        icon={<Droplets />}
        title={t("context.nisar.title")}
        source={scene?.provenance ?? null}
        detail={detail}
      >
        {state(query) ??
          (scene ? (
            <>
              {fmt(t("context.nisar.short"), {
                mean: num.format(scene.stats.mean),
                unit: scene.stats.unit,
              })}
              <span className="ml-1.5 text-caption font-normal text-ink-muted">
                {formatDate(scene.date)}
              </span>
            </>
          ) : (
            <span className="font-normal text-ink-muted" title={data?.coverage_note ?? ""}>
              {t("context.missing")}
            </span>
          ))}
      </Row>
    </ul>
  );
}

function GraceRow() {
  const query = useGrace();
  const d = query.data;
  const trend = d?.trend_cm_per_year ?? null;
  const takeaway =
    trend === null
      ? (d?.message ?? t("context.missing"))
      : Math.abs(trend) < 0.1
        ? t("context.grace.stable")
        : fmt(t(trend < 0 ? "context.grace.falling" : "context.grace.rising"), {
            trend: num.format(Math.abs(trend)),
          });
  return (
    <Row
      icon={<Gauge />}
      title={t("context.grace.title")}
      source={d?.provenance ?? null}
      detail={d?.coverage_note ?? ""}
    >
      {state(query) ?? takeaway}
    </Row>
  );
}

function GediRow() {
  const query = useGedi();
  const d = query.data;
  const covered = d && d.features.length > 0 && d.height_mean_m != null;
  return (
    <Row
      icon={<Sprout />}
      title={t("context.gedi.title")}
      source={d?.provenance[0] ?? null}
      detail={[d?.coverage_note, d?.tree_structure_hint].filter(Boolean).join(" ")}
    >
      {state(query) ??
        (covered ? (
          fmt(t("context.gedi.height"), {
            height: num.format(d.height_mean_m as number),
            count: d.features.length,
          })
        ) : (
          <span className="font-normal text-ink-muted">{t("context.missing")}</span>
        ))}
    </Row>
  );
}

function EcostressRow() {
  const query = useScenes("ecostress");
  const d = query.data;
  const latest = d?.scenes.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1);
  return (
    <Row
      icon={<Thermometer />}
      title={t("context.ecostress.title")}
      source={latest?.provenance ?? null}
      detail={d?.coverage_note ?? ""}
    >
      {state(query) ??
        (latest ? (
          <>
            {latest.variable === "esi"
              ? fmt(t("context.ecostress.esi"), { mean: num.format(latest.stats.mean) })
              : fmt(t("context.ecostress.lst"), {
                  value: temperature(latest.stats.mean, latest.stats.unit),
                })}
            <span className="ml-1.5 text-caption font-normal text-ink-muted">
              {formatDate(latest.date)}
            </span>
          </>
        ) : (
          <span className="font-normal text-ink-muted">{t("context.missing")}</span>
        ))}
    </Row>
  );
}

/** Landscape context around the field (F-19): GRACE, GEDI and ECOSTRESS, one row each. */
export function ContextCards() {
  return (
    <ul className="m-0 list-none space-y-2 p-0 pt-2">
      <GraceRow />
      <GediRow />
      <EcostressRow />
    </ul>
  );
}
