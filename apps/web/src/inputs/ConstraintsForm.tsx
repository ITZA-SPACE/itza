import type { Constraints } from "@itza/engine/contracts";
import type { KnowledgePack } from "@itza/knowledge";
import { Disclosure } from "@itza/ui-kit";
import { useId, useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { setConstraints } from "./actions";

const LEVELS = ["none", "supplemental", "full"] as const;
/** The only equipment limit the engine applies (see `EQUIPMENT_LIMITS` in the engine). */
const ROW_PLANTER = "no_row_crop_planter";

const check = "shrink-0";
/** Figma "Option card": a glass row; the chosen one gets the rain rim and a brighter glass. */
const option =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-[1.1875rem] border border-rim bg-glass px-4 py-2 text-body text-ink shadow-glass transition-colors hover:border-rim-strong has-[:checked]:border-rain has-[:checked]:bg-[rgb(174_180_233_/_0.22)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

function IrrigationCap({ constraints }: { constraints: Constraints }) {
  const id = useId();
  const cap = constraints.irrigation.cap_mm;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setError(true);
      return;
    }
    setError(false);
    setDraft(null);
    setConstraints({
      irrigation: { level: constraints.irrigation.level, ...(n === null ? {} : { cap_mm: n }) },
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-body text-ink">
          {t("inputs.irrigation.cap")}
        </label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={10}
          value={draft ?? (cap === undefined ? "" : String(cap))}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="min-h-11 w-28 rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
      </div>
      <p className="text-caption text-ink-muted">{t("inputs.irrigation.cap.hint")}</p>
      {error ? (
        <p role="alert" className="text-caption text-risk-ink">
          {t("inputs.irrigation.cap.error")}
        </p>
      ) : null}
    </div>
  );
}

/** Hard filters: irrigation, equipment, livestock, and per crop whether there is a market and whether to leave it out. */
export function ConstraintsForm({
  constraints,
  pack,
}: {
  constraints: Constraints;
  pack: KnowledgePack;
}) {
  const id = useId();
  const crops = pack.crops.filter((c) => c.kind === "crop");
  const excluded = new Set(constraints.excluded_crops ?? []);
  const market = constraints.market_access ?? {};
  const limits = new Set(constraints.equipment_limits ?? []);

  const toggleLimit = (on: boolean) => {
    const next = new Set(limits);
    if (on) next.add(ROW_PLANTER);
    else next.delete(ROW_PLANTER);
    setConstraints({ equipment_limits: [...next] });
  };
  const toggleMarket = (crop: string, has: boolean) => {
    const { [crop]: _removed, ...rest } = market;
    setConstraints({ market_access: has ? rest : { ...rest, [crop]: false } });
  };
  const toggleExcluded = (crop: string, leaveOut: boolean) => {
    const next = new Set(excluded);
    if (leaveOut) next.add(crop);
    else next.delete(crop);
    setConstraints({ excluded_crops: [...next] });
  };

  return (
    <Disclosure summary={<span id={`${id}-title`}>{t("inputs.constraints.title")}</span>}>
      <div className="space-y-5">
        <p className="text-caption text-ink-muted">{t("inputs.constraints.body")}</p>

        <fieldset className="min-w-0 space-y-2 border-0 p-0">
          <legend className="text-body font-semibold text-ink">
            {t("inputs.irrigation.title")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((level) => (
              <label
                key={level}
                className={option}
                title={t(`inputs.irrigation.${level}.hint` as never)}
              >
                <input
                  type="radio"
                  name={`${id}-irrigation`}
                  className={check}
                  checked={constraints.irrigation.level === level}
                  onChange={() =>
                    setConstraints({
                      irrigation:
                        level === "none"
                          ? { level }
                          : {
                              level,
                              ...(constraints.irrigation.cap_mm === undefined
                                ? {}
                                : { cap_mm: constraints.irrigation.cap_mm }),
                            },
                    })
                  }
                />
                <span>
                  {t(`inputs.irrigation.${level}` as never)}
                  <span className="sr-only">: {t(`inputs.irrigation.${level}.hint` as never)}</span>
                </span>
              </label>
            ))}
          </div>
          {constraints.irrigation.level === "none" ? null : (
            <IrrigationCap constraints={constraints} />
          )}
        </fieldset>

        <fieldset className="min-w-0 space-y-2 border-0 p-0">
          <legend className="text-body font-semibold text-ink">{t("inputs.farm.title")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={option}>
              <input
                type="checkbox"
                className={check}
                checked={limits.has(ROW_PLANTER)}
                onChange={(e) => toggleLimit(e.target.checked)}
              />
              {t("inputs.equipment.rowPlanter")}
            </label>
            <label className={option}>
              <input
                type="checkbox"
                className={check}
                checked={constraints.livestock}
                onChange={(e) => setConstraints({ livestock: e.target.checked })}
              />
              {t("inputs.livestock")}
            </label>
          </div>
        </fieldset>

        <fieldset className="min-w-0 space-y-2 border-0 p-0">
          <legend className="text-body font-semibold text-ink">{t("inputs.crops.title")}</legend>
          <p className="text-caption text-ink-muted">{t("inputs.crops.hint")}</p>
          <ul className="grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {crops.map((crop) => (
              <li
                key={crop.id}
                className="flex items-center gap-3 rounded-panel border border-line-soft bg-glass px-3 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-caption font-semibold text-ink">
                  {crop.name}
                </span>
                <label className="flex min-h-10 items-center gap-1.5 text-caption text-ink-muted">
                  <input
                    type="checkbox"
                    className={check}
                    checked={market[crop.id] !== false}
                    onChange={(e) => toggleMarket(crop.id, e.target.checked)}
                    aria-label={fmt(t("inputs.crops.market.aria"), { crop: crop.name })}
                  />
                  {t("inputs.crops.market")}
                </label>
                <label className="flex min-h-10 items-center gap-1.5 text-caption text-ink-muted">
                  <input
                    type="checkbox"
                    className={check}
                    checked={excluded.has(crop.id)}
                    onChange={(e) => toggleExcluded(crop.id, e.target.checked)}
                    aria-label={fmt(t("inputs.crops.exclude.aria"), { crop: crop.name })}
                  />
                  {t("inputs.crops.exclude")}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Disclosure>
  );
}
