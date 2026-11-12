import { Card } from "@itza/ui-kit";
import { AppConfidenceBadge } from "../confidence";
import { type CopyKey, t } from "../copy";
import { useReplayPreview } from "./useReplayPreview";

const percent = (x: number) => `${Math.round(x * 100)}%`;

/** Shows the replay and confidence with the farmer's observations, so an override visibly changes them. */
export function ReplayPreviewCard() {
  const state = useReplayPreview();
  return (
    <Card className="space-y-3" aria-labelledby="ground-truth-preview" aria-live="polite">
      <h3 id="ground-truth-preview" className="text-body font-semibold">
        {t("groundTruth.preview.heading")}
      </h3>
      {state.status === "ready" ? (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-body">
            <dt className="text-ink-muted">{t("groundTruth.preview.taw")}</dt>
            <dd>{Math.round(state.preview.tawMm)} mm</dd>
            <dt className="text-ink-muted">{t("groundTruth.preview.water")}</dt>
            <dd>{percent(state.preview.waterBalance)}</dd>
            <dt className="text-ink-muted">{t("groundTruth.preview.score")}</dt>
            <dd>{percent(state.preview.score)}</dd>
            <dt className="text-ink-muted">{t("groundTruth.preview.confidence")}</dt>
            <dd>
              <AppConfidenceBadge
                level={state.preview.confidence.level}
                reasons={state.preview.confidence.reasons}
              />
            </dd>
          </dl>
          <p className="text-caption text-ink-muted">{t("groundTruth.preview.note")}</p>
        </>
      ) : state.status === "error" ? (
        <p role="alert" className="text-body text-risk-ink">
          {t("groundTruth.preview.error").replace("{message}", state.message)}
        </p>
      ) : (
        <p className="text-body text-ink-muted">
          {t(`groundTruth.preview.${state.status}` as CopyKey)}
        </p>
      )}
    </Card>
  );
}
