import type { LeftOutCrop } from "@itza/engine/worker";
import { Card, Select } from "@itza/ui-kit";
import { useId, useState } from "react";
import { t } from "../copy";
import { useWhyNot } from "./useCompare";

/** "Why not X?" for any crop that is not in the cards: the filter or ranking that left it out. */
export function WhyNot({
  leftOut,
  compareKey,
}: {
  leftOut: readonly LeftOutCrop[];
  compareKey: string | null;
}) {
  const id = useId();
  const [crop, setCrop] = useState("");
  const answer = useWhyNot(compareKey, crop || null);
  if (leftOut.length === 0) return null;
  return (
    <Card aria-labelledby={`${id}-title`} className="space-y-3">
      <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
        {t("compare.whynot.title")}
      </h3>
      <p className="text-body text-ink-muted">{t("compare.whynot.body")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${id}-crop`} className="text-body font-medium text-ink">
          {t("compare.whynot.label")}
        </label>
        <Select
          id={`${id}-crop`}
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
          className="w-full sm:w-72"
        >
          <option value="">{t("compare.whynot.placeholder")}</option>
          {leftOut.map((c) => (
            <option key={c.crop} value={c.crop}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <p aria-live="polite" className="min-h-6 text-body text-ink">
        {crop && answer.data ? (
          <>
            <span className="font-semibold">
              {answer.data.excluded ? t("compare.whynot.left") : t("compare.whynot.included")}:
            </span>{" "}
            {answer.data.reason}
          </>
        ) : null}
      </p>
    </Card>
  );
}
