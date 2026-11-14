import { createFileRoute } from "@tanstack/react-router";
import { FutureStep } from "../../future/FutureStep";

export const Route = createFileRoute("/_workspace/future")({
  component: FutureStep,
});
