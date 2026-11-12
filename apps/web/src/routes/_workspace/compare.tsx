import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { CompareStep } from "../../compare/CompareStep";

export const Route = createFileRoute("/_workspace/compare")({
  component: () => (
    <FlowStepPage step="compare">
      <CompareStep />
    </FlowStepPage>
  ),
});
