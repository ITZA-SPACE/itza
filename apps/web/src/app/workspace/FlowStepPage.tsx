import { Button, EmptyState } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { type CopyKey, t } from "../../copy";
import { useFieldStore } from "../../state";
import { PageHeader } from "../shell/PageHeader";
import { FieldSummary } from "./FieldSummary";
import { STEPS, type StepId } from "./steps";

/**
 * A step of the guided flow (Field, History, Inputs, Compare): the page header with the step
 * number, the step's own content, and Back / Next to walk the flow in order.
 */
export function FlowStepPage({
  step,
  children,
  nextDisabled = false,
}: {
  step: StepId;
  children?: React.ReactNode;
  /** The next step is not open yet (its inputs are missing). */
  nextDisabled?: boolean;
}) {
  const hasField = useFieldStore((s) => s.field !== null);
  const index = STEPS.findIndex((s) => s.id === step);
  const previous = STEPS[index - 1];
  const next = STEPS[index + 1];
  const blocked = !hasField || nextDisabled;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("flow.step")
          .replace("{n}", String(index + 1))
          .replace("{total}", String(STEPS.length))}
        title={t(`flow.${step}.title` as CopyKey)}
        subtitle={t(`flow.${step}.body` as CopyKey)}
      />
      {hasField && step !== "compare" ? <FieldSummary /> : null}
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
        children
      )}
      <nav
        aria-label={t("flow.label")}
        className="flex items-center justify-between gap-2 border-t border-line-soft pt-5"
      >
        {previous ? (
          <Button asChild variant="secondary">
            <Link to={previous.to}>
              <ArrowLeft aria-hidden />
              {t("flow.back")}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          blocked ? (
            <Button disabled>
              {t("flow.next")}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button asChild>
              <Link to={next.to}>
                {t("flow.next")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          )
        ) : null}
      </nav>
    </div>
  );
}
