import { Button, EmptyState } from "@itza/ui-kit";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "../../app/shell/PageHeader";
import { CompareStep } from "../../compare/CompareStep";
import { t } from "../../copy";
import { InputsGate } from "../../inputs";
import { useFieldStore } from "../../state";

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
  const hasField = useFieldStore((s) => s.field !== null);
  return (
    <div className="space-y-6">
      <PageHeader title={t("flow.compare.title")} subtitle={t("flow.compare.body")} />
      {hasField ? (
        <InputsGate>
          <CompareStep {...(season ? { initialSeason: season } : {})} />
        </InputsGate>
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
