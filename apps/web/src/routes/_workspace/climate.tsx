import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { ClimateStep } from "../../climate";
import { t } from "../../copy";

function ClimatePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("nav.group.past")}
        title={t("climate.title")}
        subtitle={t("climate.body")}
      />
      <ClimateStep />
    </div>
  );
}

export const Route = createFileRoute("/_workspace/climate")({ component: ClimatePage });
