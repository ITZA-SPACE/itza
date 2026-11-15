import { Button } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { FlowBar } from "../app/shell/FlowBar";
import { PageHeader } from "../app/shell/PageHeader";
import { t } from "../copy";
import { HERO_FIELDS } from "../data/hero";
import { useFieldStore } from "../state";
import { FieldTwin } from "./FieldTwin";

const DEMO_FIELD = HERO_FIELDS[0]?.geometry;

/** The land step: the selected field in 3D (a demo field when none is selected), then on to the plan. */
export function FieldTwinPage() {
  const field = useFieldStore((s) => s.field);
  const geometry = field?.geometry ?? DEMO_FIELD;
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-3 pb-12">
      <PageHeader title={t("twin.title")} subtitle={t(field ? "twin.subtitle" : "twin.demo")} />
      {geometry ? <FieldTwin geometry={geometry} /> : null}
      <FlowBar question={t("twin.flow")}>
        <Button asChild variant="secondary">
          <Link to="/inputs">
            <ArrowLeft aria-hidden />
            {t("flow.back")}
          </Link>
        </Button>
        <Button asChild>
          <Link to="/compare">
            {t("twin.flow.next")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </FlowBar>
    </div>
  );
}
