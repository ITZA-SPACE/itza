import type { RotationResult } from "@itza/engine/contracts";
import { type EconomicsInput, seasonMargin } from "@itza/engine/economics";
import { t } from "../../copy";
import { fmt } from "../../lib/format";

const money = new Intl.NumberFormat("en", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/**
 * Indicative margin of every rotation in the replayed season; the proxy label is always shown.
 * Nothing is drawn until the farmer has entered a price for at least one replayed crop, so the
 * replay is not padded with a line of dashes per rotation.
 */
export function SeasonMargins({
  season,
  rotations,
  economics,
}: {
  season: string;
  rotations: readonly { id: string; name: string; result: RotationResult | undefined }[];
  economics: EconomicsInput;
}) {
  const margins = rotations.map(({ id, name, result }) => {
    const row = result?.seasons.find((s) => s.season === season);
    return { id, name, margin: row ? seasonMargin(row, economics[row.crop]).margin : null };
  });
  if (margins.every((m) => m.margin === null)) return null;
  return (
    <section className="space-y-1 text-body">
      <h4 className="font-semibold text-ink">{fmt(t("economics.season.heading"), { season })}</h4>
      <ul className="space-y-0.5">
        {margins.map(({ id, name, margin }) => {
          return (
            <li key={id}>
              {name}:{" "}
              {margin === null ? (
                <span className="text-ink-muted">{t("economics.season.none")}</span>
              ) : (
                <strong>{money.format(margin)}</strong>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-muted">{t("economics.label")}</p>
    </section>
  );
}
