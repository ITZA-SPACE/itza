import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { HistoryStep } from "../../memory";

export const Route = createFileRoute("/_workspace/history")({
  component: () => (
    <FlowStepPage step="history">
      <HistoryStep />
    </FlowStepPage>
  ),
});
