import type { CropEconomics, EconomicsInput } from "@itza/engine/economics";
import { Button, Disclosure } from "@itza/ui-kit";
import { t } from "../../copy";

const FIELDS = [
  ["yieldTonnesPerHa", "economics.yield"],
  ["pricePerTonne", "economics.price"],
  ["costPerHa", "economics.cost"],
] as const;

/**
 * Per-crop price, yield and cost inputs, folded until the farmer wants margins: one row per crop,
 * one column per value. State lives with the caller (controlled).
 */
export function EconomicsPanel({
  crops,
  value,
  onChange,
}: {
  crops: readonly { id: string; name: string }[];
  value: EconomicsInput;
  onChange: (next: EconomicsInput) => void;
}) {
  // An empty or invalid field is unset, never 0: the engine prices a crop only once all three are set.
  const set = (id: string, key: keyof CropEconomics, raw: string) => {
    const n = Number.parseFloat(raw);
    const { [key]: _, ...rest } = value[id] ?? {};
    onChange({ ...value, [id]: Number.isFinite(n) && n >= 0 ? { ...rest, [key]: n } : rest });
  };
  const priced = crops.filter((c) => Object.keys(value[c.id] ?? {}).length > 0).length;
  return (
    <Disclosure summary={t("economics.title")} {...(priced > 0 ? { count: priced } : {})}>
      <div className="space-y-3">
        <p className="text-caption text-ink-muted">
          {t("economics.intro")} {t("economics.label")}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-caption">
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="pb-1 font-medium">
                  <span className="sr-only">{t("economics.crop")}</span>
                </th>
                {FIELDS.map(([key, copy]) => (
                  <th key={key} scope="col" className="pb-1 font-medium">
                    {t(copy)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crops.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="py-1 pr-3 text-left font-medium text-ink">
                    {c.name}
                  </th>
                  {FIELDS.map(([key, copy]) => (
                    <td key={key} className="py-1 pr-2">
                      <input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        aria-label={`${c.name}: ${t(copy)}`}
                        className="w-full rounded-control border border-line-soft bg-glass px-2 py-1 text-ink"
                        value={value[c.id]?.[key] ?? ""}
                        onChange={(e) => set(c.id, key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-subtle">{t("economics.basis")}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({})}>
            {t("economics.reset")}
          </Button>
        </div>
      </div>
    </Disclosure>
  );
}
