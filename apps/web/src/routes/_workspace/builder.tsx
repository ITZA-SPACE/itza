import { createFileRoute } from "@tanstack/react-router";
import { BuilderStep } from "../../builder/BuilderStep";

export const Route = createFileRoute("/_workspace/builder")({
  component: BuilderStep,
});
