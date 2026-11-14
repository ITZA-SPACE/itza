import type { Constraints } from "@itza/engine/contracts";
import type { KnowledgePack } from "@itza/knowledge";
import { useId, useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { setConstraints } from "./actions";

const LEVELS = ["none", "supplemental", "full"] as const;
/** The only equipment limit the engine applies (see `EQUIPMENT_LIMITS` in the engine). */
const ROW_PLANTER = "no_row_crop_planter";

const check = "size-5 accent-[color:var(--color-accent)]";

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
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("inputs.constraints.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("inputs.constraints.body")}</p>
      </div>

      <fieldset className="min-w-0 space-y-2 border-0 p-0">
        <legend className="text-body font-semibold text-ink">{t("inputs.irrigation.title")}</legend>
        {LEVELS.map((level) => (
          <label key={level} className="flex min-h-11 items-center gap-3 text-body text-ink">
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
              <span className="block text-caption text-ink-muted">
                {t(`inputs.irrigation.${level}.hint` as never)}
              </span>
            </span>
          </label>
        ))}
        {constraints.irrigation.level === "none" ? null : (
          <IrrigationCap constraints={constraints} />
        )}
      </fieldset>

      <fieldset className="min-w-0 space-y-2 border-0 p-0">
        <legend className="text-body font-semibold text-ink">{t("inputs.farm.title")}</legend>
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className={check}
            checked={limits.has(ROW_PLANTER)}
            onChange={(e) => toggleLimit(e.target.checked)}
          />
          {t("inputs.equipment.rowPlanter")}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className={check}
            checked={constraints.livestock}
            onChange={(e) => setConstraints({ livestock: e.target.checked })}
          />
          {t("inputs.livestock")}
        </label>
      </fieldset>

      <fieldset className="min-w-0 space-y-2 border-0 p-0">
        <legend className="text-body font-semibold text-ink">{t("inputs.crops.title")}</legend>
        <p className="text-caption text-ink-muted">{t("inputs.crops.hint")}</p>
        <ul className="space-y-1">
          {crops.map((crop) => (
            <li key={crop.id} className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="w-44 text-body font-medium text-ink">{crop.name}</span>
              <label className="flex min-h-11 items-center gap-2 text-body text-ink">
                <input
                  type="checkbox"
                  className={check}
                  checked={market[crop.id] !== false}
                  onChange={(e) => toggleMarket(crop.id, e.target.checked)}
                  aria-label={fmt(t("inputs.crops.market.aria"), { crop: crop.name })}
                />
                {t("inputs.crops.market")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-body text-ink">
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
    </section>
  );
}
