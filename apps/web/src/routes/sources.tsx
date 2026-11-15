import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "../app/PageContainer";
import { PageHeader } from "../app/shell/PageHeader";
import { t } from "../copy";
import { MethodsTabs } from "../methods";

/** Sources: how every number is computed, how it was validated, and every dataset with its license. */
function SourcesPage() {
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader title={t("methods.title")} subtitle={t("methods.intro")} />
        <MethodsTabs />
      </div>
    </PageContainer>
  );
}

export const Route = createFileRoute("/sources")({ component: SourcesPage });
