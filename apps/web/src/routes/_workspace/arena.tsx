import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { ArenaStep } from "../../arena";
import { t } from "../../copy";
import { ValidationStep } from "../../validation";

const SEASON = /^[0-9]{4}(-[0-9]{2})?$/;

export const Route = createFileRoute("/_workspace/arena")({
  validateSearch: (search: Record<string, unknown>): { season?: string } =>
    typeof search.season === "string" && SEASON.test(search.season)
      ? { season: search.season }
      : {},
  component: ArenaPage,
});

function ArenaPage() {
  const { season } = Route.useSearch();
  return (
    <div className="space-y-8">
      <PageHeader title={t("decide.title")} subtitle={t("decide.body")} />
      <section aria-labelledby="decide-field" className="space-y-3">
        <h2 id="decide-field" className="text-title font-semibold text-ink">
          {t("decide.field")}
        </h2>
        <ArenaStep {...(season ? { initialSeason: season } : {})} />
      </section>
      <section aria-labelledby="decide-proof" className="space-y-3">
        <h2 id="decide-proof" className="text-title font-semibold text-ink">
          {t("decide.proof")}
        </h2>
        <ValidationStep />
      </section>
    </div>
  );
}
