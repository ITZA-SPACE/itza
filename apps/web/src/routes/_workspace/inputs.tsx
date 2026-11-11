import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";

export const Route = createFileRoute("/_workspace/inputs")({
  component: () => <FlowStepPage step="inputs" />,
});
