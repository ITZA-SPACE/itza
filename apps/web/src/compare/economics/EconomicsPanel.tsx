import { type CropEconomics, ECONOMICS_LABEL, type EconomicsInput } from "@itza/engine/economics";
import { Button, Card } from "@itza/ui-kit";
import { t } from "../../copy";

const FIELDS = [
  ["yieldTonnesPerHa", "economics.yield"],
  ["pricePerTonne", "economics.price"],
  ["costPerHa", "economics.cost"],
] as const;

/** Per-crop price, yield and cost inputs. State lives with the caller (controlled). */
export function EconomicsPanel({
  crops,
  value,
  onChange,
}: {
  crops: readonly { id: string; name: string }[];
  value: EconomicsInput;
  onChange: (next: EconomicsInput) => void;
}) {
  const set = (id: string, key: keyof CropEconomics, raw: string) => {
    const n = Number.parseFloat(raw);
    const cur = value[id] ?? { yieldTonnesPerHa: 0, pricePerTonne: 0, costPerHa: 0 };
    onChange({ ...value, [id]: { ...cur, [key]: Number.isFinite(n) && n >= 0 ? n : 0 } });
  };
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-semibold">{t("economics.title")}</h2>
      <p className="text-sm font-medium">{ECONOMICS_LABEL}</p>
      <p className="text-sm">{t("economics.intro")}</p>
      {crops.map((c) => (
        <fieldset key={c.id} className="grid grid-cols-3 gap-2">
          <legend className="font-medium">{c.name}</legend>
          {FIELDS.map(([key, copy]) => (
            <label key={key} className="text-sm">
              {t(copy)}
              <input
                type="number"
                min={0}
                inputMode="decimal"
                className="mt-1 w-full rounded border px-2 py-1"
                value={value[c.id]?.[key] ?? ""}
                onChange={(e) => set(c.id, key, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <Button type="button" onClick={() => onChange({})}>
        {t("economics.reset")}
      </Button>
      <p className="text-xs">{t("economics.basis")}</p>
    </Card>
  );
}
