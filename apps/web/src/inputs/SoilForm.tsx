import type { Soil } from "@itza/engine/contracts";
import { Badge, Disclosure } from "@itza/ui-kit";
import { RotateCcw } from "lucide-react";
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

/** The value's origin in words, for the tooltip and screen readers. */
function originText(shown: ShownSoil): string {
  return shown.origin === "default"
    ? fmt(t("inputs.soil.origin.default"), { source: sourceName(shown.source) })
    : fmt(t("inputs.soil.origin.source"), {
        source: sourceName(shown.source),
        confidence: t(`confidence.${shown.confidence}`),
      });
}

/** A short tag on a tile whose value is not from the soil maps: the farmer's own, or a default. */
function OriginTag({ shown }: { shown: ShownSoil }) {
  if (shown.origin === "default") return <Badge tone="warn">{t("inputs.soil.tag.default")}</Badge>;
  if (shown.origin === "farmer") return <Badge tone="good">{t("inputs.soil.tag.farmer")}</Badge>;
  return null;
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
    <div
      title={originText(shown)}
      className="min-w-0 space-y-1.5 rounded-panel border border-line-soft bg-glass p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="truncate text-caption font-medium text-ink-muted">
          {t(field.label)}
        </label>
        <OriginTag shown={shown} />
      </div>
      <div className="flex items-center gap-2">
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
          className="min-h-10 w-full min-w-0 rounded-control border border-line-soft bg-surface px-3 font-display text-title font-bold text-ink tabular-nums"
        />
        <span className="shrink-0 text-caption text-subtle">{t(field.unit)}</span>
        {overridden ? (
          <button
            type="button"
            aria-label={fmt(t("inputs.soil.reset.aria"), { property: t(field.label) })}
            title={t("inputs.soil.reset")}
            className="shrink-0 rounded-full p-1.5 text-subtle hover:bg-glass hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            onClick={() => {
              setSoilValue(field.key as SoilKey, null);
              setDraft(null);
              setError(null);
            }}
          >
            <RotateCcw aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <p id={`${id}-info`} className="text-caption">
        <span className="sr-only">{originText(shown)}</span>
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
    <Disclosure
      summary={
        <span id={`${id}-title`}>
          {t("inputs.soil.title")} ·{" "}
          <span className="font-normal text-ink-muted">
            {t(`inputs.texture.${texture}` as never)}
          </span>
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-caption text-ink-muted">{t("inputs.soil.body")}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
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
        </div>
      </div>
    </Disclosure>
  );
}
