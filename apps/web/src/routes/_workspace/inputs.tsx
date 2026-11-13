import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { GroundTruthPanel } from "../../groundtruth";
import { InputsStep, useReadiness } from "../../inputs";

function InputsPage() {
  const { ready } = useReadiness();
  return (
    <FlowStepPage step="inputs" nextDisabled={!ready}>
      <InputsStep />
      <GroundTruthPanel />
    </FlowStepPage>
  );
}

export const Route = createFileRoute("/_workspace/inputs")({ component: InputsPage });
