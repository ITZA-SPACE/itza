import type { CompareResult, Weighted } from "@itza/engine/worker";
import { t } from "../copy";
import { AppDisclaimerList } from "../disclaimers";
import { fmt, formatDegrees, formatHectares } from "../lib/format";
import type { FieldGeometry } from "../state";
import { FieldThumbnail } from "./FieldThumbnail";
import { usePinnedStore } from "./pinnedStore";
import { Qr } from "./Qr";

const ROTATIONS = 3;
const LINES = 3;

function Lines({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section>
      <h4 className="font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p>{t("report.card.none")}</p>
      ) : (
        <ul className="list-disc pl-4">
          {items.slice(0, LINES).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The one-page rotation card: field, the best three rotations with their evidence, gaps and risks,
 * the disclaimers and a QR code to the live view. Shown only when printing (see styles.css).
 */
export function RotationCard({
  view,
  field,
  link,
}: {
  view: CompareResult & Weighted;
  field: FieldGeometry;
  link: string;
}) {
  const pinned = usePinnedStore((s) => s.pinned);
  const names = new Map(view.rotations.map((r) => [r.id, r.name]));
  const cards = [...view.cards].sort((a, b) => b.score - a.score).slice(0, ROTATIONS);
  return (
    <article className="space-y-3 bg-surface p-0 text-[10px] leading-snug text-ink">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-2">
        <div>
          <p className="text-xl font-bold text-accent-strong">{t("app.name")}</p>
          <p>{t("app.tagline")}</p>
          <h2 className="mt-2 text-sm font-semibold">{t("report.card.title")}</h2>
          <p>
            {fmt(t("compare.field.line"), {
              area: formatHectares(field.areaHa),
              lat: formatDegrees(field.centroid[1], t("map.field.north"), t("map.field.south")),
              lon: formatDegrees(field.centroid[0], t("map.field.east"), t("map.field.west")),
            })}
          </p>
          <p>{view.label}</p>
        </div>
        <FieldThumbnail geometry={field.geometry} label={t("report.card.field")} />
      </header>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <section
            key={card.rotation_id}
            className="space-y-2 break-inside-avoid rounded-control border border-line p-2"
          >
            <h3 className="text-xs font-semibold">
              {names.get(card.rotation_id) ?? card.rotation_id}
              {card.is_baseline ? ` (${t("report.card.baseline")})` : ""}
            </h3>
            <p>
              <span className="text-base font-bold">{card.score.toFixed(2)}</span>{" "}
              {t("report.card.score")}
            </p>
            <p className="font-medium">{card.resilience_headline}</p>
            <section>
              <h4 className="font-semibold">{t("report.card.evidence")}</h4>
              <ul className="list-disc pl-4">
                {card.evidence.slice(0, LINES).map((item) => (
                  <li key={item.indicator}>
                    {item.indicator}: {item.value} ({item.comparison}).{" "}
                    <span className="text-ink-muted">
                      {item.source} · {item.resolution} · {item.period}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <Lines title={t("report.card.gaps")} items={card.gaps} />
            <Lines title={t("report.card.risks")} items={card.risks} />
          </section>
        ))}
      </div>
      {pinned.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold">{t("report.card.pinned")}</h3>
          <ul className="list-disc pl-4">
            {pinned.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.title}:</span> {p.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="flex items-end justify-between gap-4 border-t border-line pt-2">
        <AppDisclaimerList className="flex-1 text-[9px]" />
        <div className="text-center">
          <Qr text={link} label={t("report.card.qr.label")} />
          <p>{t("report.card.qr")}</p>
        </div>
      </footer>
    </article>
  );
}
