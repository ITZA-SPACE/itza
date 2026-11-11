import { ConfidenceBadge, type ConfidenceLevel } from "@itza/ui-kit";
import { t } from "./copy";

/** NFR-related confidence badge, wired to the English copy. */
export function AppConfidenceBadge({
  level,
  reasons,
}: {
  level: ConfidenceLevel;
  reasons?: string[];
}) {
  return (
    <ConfidenceBadge
      level={level}
      label={t(`confidence.${level}`)}
      reasonsHeading={t("confidence.reasonsHeading")}
      {...(reasons ? { reasons } : {})}
    />
  );
}
