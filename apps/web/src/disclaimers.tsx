import { Disclaimer, DisclaimerList } from "@itza/ui-kit";
import { type CopyKey, t } from "./copy";

const disclaimerIds = ["judgment", "relative", "gaps", "satellite"] as const;

export type DisclaimerId = (typeof disclaimerIds)[number];

/** PRD §12 product disclaimer, wired to the English copy by id. */
export function AppDisclaimer({ id, className }: { id: DisclaimerId; className?: string }) {
  return (
    <Disclaimer {...(className ? { className } : {})}>
      {t(`disclaimer.${id}` as CopyKey)}
    </Disclaimer>
  );
}

/** All PRD §12 product disclaimers. */
export function AppDisclaimerList({ className }: { className?: string }) {
  return (
    <DisclaimerList
      {...(className ? { className } : {})}
      items={disclaimerIds.map((id) => t(`disclaimer.${id}` as CopyKey))}
    />
  );
}
