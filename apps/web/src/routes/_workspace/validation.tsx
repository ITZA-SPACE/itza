import { createFileRoute } from "@tanstack/react-router";
import { t } from "../../copy";
import { ValidationStep } from "../../validation";

export const Route = createFileRoute("/_workspace/validation")({ component: ValidationPage });

function ValidationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-title font-semibold text-ink">{t("validation.title")}</h1>
      <p className="text-body text-ink-muted">{t("validation.body")}</p>
      <ValidationStep />
    </div>
  );
}
