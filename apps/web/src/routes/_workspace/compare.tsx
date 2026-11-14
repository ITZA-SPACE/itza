import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { CompareStep } from "../../compare/CompareStep";

/** `?season=2021-22` opens the replay on that season (the climate fingerprint links here). */
const SEASON = /^[0-9]{4}(-[0-9]{2})?$/;

export const Route = createFileRoute("/_workspace/compare")({
  validateSearch: (search: Record<string, unknown>): { season?: string } =>
    typeof search.season === "string" && SEASON.test(search.season)
      ? { season: search.season }
      : {},
  component: ComparePage,
});

function ComparePage() {
  const { season } = Route.useSearch();
  return (
    <FlowStepPage step="compare">
      <CompareStep {...(season ? { initialSeason: season } : {})} />
    </FlowStepPage>
  );
}
