import type { CatalogHost, CatalogLabels } from "@itza/ui-kit/catalog/react";
import { t } from "../copy";
import { renderers } from "./renderers";

export function catalogLabels(): CatalogLabels {
  return {
    unavailable: t("assistant.answer.unavailable"),
    sourcesHeading: t("assistant.sources"),
    traceOpen: t("assistant.trace.open"),
    traceClose: t("assistant.trace.close"),
    traceTitle: t("assistant.trace.title"),
    traceEmpty: t("assistant.trace.empty"),
    provenance: {
      source: t("compare.provenance.source"),
      resolution: t("compare.provenance.resolution"),
      period: t("compare.provenance.period"),
    },
  };
}

export function makeHost(onAction: CatalogHost["onAction"]): CatalogHost {
  return { labels: catalogLabels(), render: renderers, onAction };
}
