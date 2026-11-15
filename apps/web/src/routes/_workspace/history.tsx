import { Button, EmptyState } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { t } from "../../copy";
import { HistoryStep } from "../../memory";
import { useFieldStore } from "../../state";

function HistoryPage() {
  const hasField = useFieldStore((s) => s.field !== null);
  return (
    <div className="space-y-6">
      <PageHeader title={t("flow.history.title")} subtitle={t("flow.history.body")} />
      {hasField ? (
        <HistoryStep />
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

export const Route = createFileRoute("/_workspace/history")({ component: HistoryPage });
