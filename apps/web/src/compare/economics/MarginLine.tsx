import { ECONOMICS_LABEL, type RotationMargin } from "@itza/engine/economics";
import { t } from "../../copy";

const money = new Intl.NumberFormat("en", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** Margin of one rotation for its card and replay; the proxy label is always rendered with it. */
export function MarginLine({ margin }: { margin: RotationMargin }) {
  return (
    <div className="text-sm">
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
      <p className="text-xs">{ECONOMICS_LABEL}</p>
    </div>
  );
}
