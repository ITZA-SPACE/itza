import type { RotationResult } from "@itza/engine/contracts";
import { type EconomicsInput, seasonMargin } from "@itza/engine/economics";
import { t } from "../../copy";
import { fmt } from "../../lib/format";

const money = new Intl.NumberFormat("en", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** Indicative margin of every rotation in the replayed season; the proxy label is always shown. */
export function SeasonMargins({
  season,
  rotations,
  economics,
}: {
  season: string;
  rotations: readonly { id: string; name: string; result: RotationResult | undefined }[];
  economics: EconomicsInput;
}) {
  return (
    <section className="space-y-1 text-body">
      <h4 className="font-semibold text-ink">{fmt(t("economics.season.heading"), { season })}</h4>
      <ul className="space-y-0.5">
        {rotations.map(({ id, name, result }) => {
          const row = result?.seasons.find((s) => s.season === season);
          const margin = row ? seasonMargin(row, economics[row.crop]).margin : null;
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
      <p className="text-xs font-medium">{t("economics.label")}</p>
    </section>
  );
}
