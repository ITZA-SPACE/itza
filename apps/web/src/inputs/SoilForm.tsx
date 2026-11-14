import type { Soil } from "@itza/engine/contracts";
import { Badge, Button } from "@itza/ui-kit";
import { useId, useState } from "react";
import { hasCopy, t } from "../copy";
import { fmt } from "../lib/format";
import { setSoilValue } from "./actions";
import {
  type ShownSoil,
  SOIL_FIELDS,
  type SoilField,
  type SoilKey,
  shownSoil,
  shownTexture,
} from "./soil";

const sourceName = (source: string): string =>
  hasCopy(`inputs.source.${source}`) ? t(`inputs.source.${source}` as never) : source;

function Origin({ shown }: { shown: ShownSoil }) {
  const confidence = t(`confidence.${shown.confidence}`);
  if (shown.origin === "default") {
    return (
      <Badge tone="warn">
        {fmt(t("inputs.soil.origin.default"), { source: sourceName(shown.source) })}
      </Badge>
    );
  }
  return (
    <Badge tone={shown.origin === "farmer" ? "good" : "neutral"}>
      {fmt(t("inputs.soil.origin.source"), { source: sourceName(shown.source), confidence })}
    </Badge>
  );
}

function SoilRow({
  field,
  shown,
  overridden,
  limit,
}: {
  field: SoilField;
  shown: ShownSoil;
  overridden: boolean;
  /** Largest value allowed now, when another property bounds this one (clay plus sand). */
  limit?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = draft ?? shown.value.toFixed(field.digits);
  const max = Math.min(field.max, limit ?? field.max);

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed === "") {
      setSoilValue(field.key as SoilKey, null);
      setDraft(null);
      setError(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < field.min || n > max) {
      setError(fmt(t("inputs.soil.error"), { min: field.min, max }));
      return;
    }
    setSoilValue(field.key as SoilKey, n);
    setDraft(null);
    setError(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="w-44 text-body text-ink">
          {t(field.label)} <span className="text-ink-muted">({t(field.unit)})</span>
        </label>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={max}
          step={field.step}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-info`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="min-h-11 w-28 rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
        {overridden ? (
          <Button
            type="button"
            variant="secondary"
            aria-label={fmt(t("inputs.soil.reset.aria"), { property: t(field.label) })}
            onClick={() => {
              setSoilValue(field.key as SoilKey, null);
              setDraft(null);
              setError(null);
            }}
          >
            {t("inputs.soil.reset")}
          </Button>
        ) : null}
      </div>
      <p id={`${id}-info`} className="flex flex-wrap items-center gap-2 text-caption">
        <Origin shown={shown} />
        {error ? (
          <span role="alert" className="text-risk-ink">
            {error}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Soil texture, organic carbon, pH, water capacity and depth. Each value is the farmer's, the
 * satellites' or a labeled default, and says which. An edit is the farmer's own and persists.
 */
export function SoilForm({
  bundleSoil,
  overrides,
}: {
  bundleSoil: Soil | undefined;
  overrides: Soil;
}) {
  const id = useId();
  const shown = Object.fromEntries(
    SOIL_FIELDS.map((f) => [f.key, shownSoil(f.key, bundleSoil, overrides)]),
  ) as Record<SoilKey, ShownSoil>;
  const texture = shownTexture(bundleSoil, overrides);
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("inputs.soil.title")}
        </h2>
        <p className="text-body text-ink-muted">{t("inputs.soil.body")}</p>
        <p className="text-body text-ink">
          {fmt(t("inputs.soil.texture"), { texture: t(`inputs.texture.${texture}` as never) })}
        </p>
      </div>
      {SOIL_FIELDS.map((field) => (
        <SoilRow
          key={field.key}
          field={field}
          shown={shown[field.key]}
          overridden={field.key in overrides}
          {...(field.key === "clay_pct"
            ? { limit: 100 - shown.sand_pct.value }
            : field.key === "sand_pct"
              ? { limit: 100 - shown.clay_pct.value }
              : {})}
        />
      ))}
    </section>
  );
}
