import { Button, EmptyState } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { t } from "../../copy";
import { InputsStep } from "../../inputs";
import { useFieldStore } from "../../state";

function InputsPage() {
  const hasField = useFieldStore((s) => s.field !== null);
  return (
    <div className="space-y-6">
      <PageHeader title={t("flow.inputs.title")} subtitle={t("flow.inputs.body")} />
      {hasField ? (
        <InputsStep />
      ) : (
        <EmptyState
          title={t("flow.needField")}
          action={
            <Button asChild>
              <Link to="/field">{t("flow.toField")}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/_workspace/inputs")({ component: InputsPage });
