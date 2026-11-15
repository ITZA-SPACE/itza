import { createFileRoute, redirect } from "@tanstack/react-router";

/** Validation now lives on the Decide page, next to the model arena; old links land there. */
export const Route = createFileRoute("/_workspace/validation")({
  beforeLoad: () => {
    throw redirect({ to: "/arena" });
  },
});
