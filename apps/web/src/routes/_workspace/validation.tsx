import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { t } from "../../copy";
import { ValidationStep } from "../../validation";

export const Route = createFileRoute("/_workspace/validation")({ component: ValidationPage });

function ValidationPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={t("validation.title")} subtitle={t("validation.body")} />
      <ValidationStep />
    </div>
  );
}
