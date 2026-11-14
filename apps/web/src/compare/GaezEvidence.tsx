import { type KnowledgePack, loadPack } from "@itza/knowledge";
import { Disclosure, ProvenanceChip } from "@itza/ui-kit";
import { type CopyKey, t } from "../copy";
import { fmt, formatDate, formatDegrees } from "../lib/format";
import { type GaezEvidence as GaezEntry, gaezCrops, inGaezCell } from "./gaez";

const CLASS_KEYS = [
  "gaez.class.1",
  "gaez.class.2",
  "gaez.class.3",
  "gaez.class.4",
  "gaez.class.5",
  "gaez.class.6",
  "gaez.class.7",
  "gaez.class.8",
] as const satisfies readonly CopyKey[];

function Source({ entry, pack }: { entry: GaezEntry; pack: KnowledgePack }) {
  const source = pack.sources[entry.source];
  return (
    <ProvenanceChip
      source={fmt(t("gaez.source"), { version: entry.version })}
      resolution={fmt(t("gaez.resolution"), { seconds: entry.resolution_arc_seconds })}
      period={entry.period}
      labels={{
        source: t("compare.provenance.source"),
        resolution: t("compare.provenance.resolution"),
        period: t("compare.provenance.period"),
      }}
      detail={
        <div className="space-y-2 break-words">
          <p>{t(`gaez.conditions.${entry.input_level}`)}</p>
          <p>
            {fmt(t("gaez.location"), {
              lat: formatDegrees(
                entry.location.latitude,
                t("map.field.north"),
                t("map.field.south"),
              ),
              lon: formatDegrees(
                entry.location.longitude,
                t("map.field.east"),
                t("map.field.west"),
              ),
            })}
          </p>
          <p>{entry.note}</p>
          <p>{source?.citation}</p>
          <p>{fmt(t("gaez.accessed"), { date: formatDate(entry.accessed) })}</p>
          {source?.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("gaez.catalog")}
            </a>
          ) : null}
        </div>
      }
    />
  );
}

/** Independent crop context inside each rotation card. It never enters the worker/scoring path. */
export function GaezEvidence({
  packId,
  cropIds,
  centroid,
}: {
  packId: string;
  cropIds: readonly string[];
  centroid: readonly [number, number] | undefined;
}) {
  const pack = loadPack(packId);
  const rows = gaezCrops(pack, cropIds);
  if (rows.length === 0) return null;

  return (
    <Disclosure summary={t("gaez.title")} count={rows.length}>
      <p className="text-caption text-ink-muted">{t("gaez.advisory")}</p>
      <p className="mt-1 text-caption text-ink-muted">{t("gaez.scope")}</p>
      <ul className="mt-3 space-y-3 text-caption sm:text-body">
        {rows.map(({ crop, evidence }) => {
          const local = inGaezCell(centroid, evidence);
          const classKey = evidence.value === null ? undefined : CLASS_KEYS[evidence.value - 1];
          const rated = local && evidence.status === "available" && classKey;
          return (
            <li key={crop.id} className="space-y-1">
              <p className={rated && (evidence.value ?? 0) >= 6 ? "text-warn-ink" : "text-ink"}>
                {rated
                  ? fmt(t("gaez.rating"), { crop: crop.name, rating: t(classKey) })
                  : fmt(t(local ? "gaez.unavailable" : "gaez.outside"), { crop: crop.name })}
              </p>
              {rated && (evidence.value ?? 0) >= 6 ? (
                <p className="text-caption text-warn-ink">{t("gaez.risk")}</p>
              ) : null}
              <Source entry={evidence} pack={pack} />
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}
