import type { RotationMargin } from "@itza/engine/economics";
import { ProvenanceChip } from "@itza/ui-kit";
import { t } from "../../copy";

const money = new Intl.NumberFormat("en", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** Margin of one rotation for its card and replay; the proxy label is always rendered with it. */
export function MarginLine({ margin }: { margin: RotationMargin }) {
  const first = margin.seasons[0]?.season;
  const last = margin.seasons.at(-1)?.season;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {margin.meanMargin === null ? (
          t("economics.none")
        ) : (
          <>
            {t("economics.mean")}: <strong>{money.format(margin.meanMargin)}</strong>
          </>
        )}
      </p>
      {margin.missingSeasons > 0 && margin.meanMargin !== null ? (
        <p>{t("economics.missing")}</p>
      ) : null}
      <p className="text-xs font-medium">{t("economics.label")}</p>
      {margin.meanMargin !== null && first && last ? (
        <ProvenanceChip
          source={t("economics.provenance.source")}
          resolution={t("economics.provenance.resolution")}
          period={first === last ? first : `${first} to ${last}`}
          detail={t("economics.basis")}
          labels={{
            source: t("economics.provenance.label.source"),
            resolution: t("economics.provenance.label.resolution"),
            period: t("economics.provenance.label.period"),
          }}
        />
      ) : null}
    </div>
  );
}
