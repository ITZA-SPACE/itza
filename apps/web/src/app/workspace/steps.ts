/** The farmer's path through the app; each step is a route under the workspace layout. */
export const STEPS = [
  { id: "field", to: "/field", label: "flow.field" },
  { id: "history", to: "/history", label: "flow.history" },
  { id: "inputs", to: "/inputs", label: "flow.inputs" },
  { id: "compare", to: "/compare", label: "flow.compare" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
