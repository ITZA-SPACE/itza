import { Button, EmptyState } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { type CopyKey, t } from "../../copy";
import { useFieldStore } from "../../state";
import { FieldSummary } from "./FieldSummary";
import { STEPS, type StepId } from "./steps";

/**
 * A step of the flow. The features that fill the steps (history confirmation, farmer inputs, the
 * comparison) replace the body of their own route file; the navigation around them stays here.
 */
export function FlowStepPage({ step, children }: { step: StepId; children?: React.ReactNode }) {
  const hasField = useFieldStore((s) => s.field !== null);
  const index = STEPS.findIndex((s) => s.id === step);
  const previous = STEPS[index - 1];
  const next = STEPS[index + 1];
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-muted">
        {t("flow.step")
          .replace("{n}", String(index + 1))
          .replace("{total}", String(STEPS.length))}
      </p>
      {step === "field" ? null : (
        <>
          <h1 className="text-title font-semibold text-ink">
            {t(`flow.${step}.title` as CopyKey)}
          </h1>
          <p className="text-body text-ink-muted">{t(`flow.${step}.body` as CopyKey)}</p>
        </>
      )}
      {hasField || step === "field" ? <FieldSummary /> : null}
      {step !== "field" && !hasField ? (
        <EmptyState
          title={t("flow.needField")}
          action={
            <Button asChild>
              <Link to="/field">{t("flow.toField")}</Link>
            </Button>
          }
        />
      ) : (
        (children ??
        (step === "field" ? null : <p className="text-body text-ink-muted">{t("flow.pending")}</p>))
      )}
      <div className="flex justify-between gap-2">
        {previous ? (
          <Button asChild variant="secondary">
            <Link to={previous.to}>{t("flow.back")}</Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild disabled={!hasField}>
            <Link to={next.to} aria-disabled={!hasField}>
              {t("flow.next")}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
