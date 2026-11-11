import { Term } from "@itza/ui-kit";
import { type CopyKey, t } from "./copy";

export const glossaryTermIds = [
  "ndvi",
  "et",
  "et0",
  "kc",
  "soilMoistureAnomaly",
  "waterBalance",
  "frostRisk",
  "fallow",
  "seasonReplay",
  "ssp",
  "managementZone",
  "groundTruth",
  "informationNeed",
  "genUi",
] as const;

export type GlossaryTermId = (typeof glossaryTermIds)[number];

/** Inline glossary term (PRD §14): wires `Term` to the English copy by id. */
export function GlossaryTerm({ id }: { id: GlossaryTermId }) {
  const key = (suffix: "title" | "definition" | "label") => `glossary.${id}.${suffix}` as CopyKey;
  return (
    <Term title={t(key("title"))} definition={t(key("definition"))}>
      {t(key("label"))}
    </Term>
  );
}
