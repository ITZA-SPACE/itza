import { createFileRoute } from "@tanstack/react-router";
import { ArenaStep } from "../../arena";
import { t } from "../../copy";

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
    <div className="space-y-4">
      <h1 className="text-title font-semibold text-ink">{t("arena.title")}</h1>
      <p className="text-body text-ink-muted">{t("arena.body")}</p>
      <ArenaStep {...(season ? { initialSeason: season } : {})} />
    </div>
  );
}
