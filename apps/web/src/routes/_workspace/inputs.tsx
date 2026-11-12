import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { GroundTruthPanel } from "../../groundtruth";

export const Route = createFileRoute("/_workspace/inputs")({
  component: () => (
    <FlowStepPage step="inputs">
      <GroundTruthPanel />
    </FlowStepPage>
  ),
});
