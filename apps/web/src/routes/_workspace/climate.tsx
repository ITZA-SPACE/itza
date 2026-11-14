import { createFileRoute } from "@tanstack/react-router";
import { ClimateStep } from "../../climate";
import { t } from "../../copy";

function ClimatePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-title font-semibold text-ink">{t("climate.title")}</h1>
      <p className="text-body text-ink-muted">{t("climate.body")}</p>
      <ClimateStep />
    </div>
  );
}

export const Route = createFileRoute("/_workspace/climate")({ component: ClimatePage });
