import { createFileRoute } from "@tanstack/react-router";
import { FlowStepPage } from "../../app/workspace/FlowStepPage";
import { InputsStep, useReadiness } from "../../inputs";

function InputsPage() {
  const { ready } = useReadiness();
  return (
    <FlowStepPage step="inputs" nextDisabled={!ready}>
      <InputsStep />
    </FlowStepPage>
  );
}

export const Route = createFileRoute("/_workspace/inputs")({ component: InputsPage });
