import { A2UI_VERSION, CATALOG_ID, type ComponentName } from "./schemas";

export type A2uiMessage = Record<string, unknown>;
export type ComponentSpec = { id: string; component: ComponentName } & Record<string, unknown>;

/** Standard data-model paths the app writes tool results to. Components bind to these. */
export const DATA_PATHS = {
  rotations: "/compare/rotations",
  backtest: "/backtest/result",
  season: "/season/current",
  climate: "/climate/fingerprint",
  future: "/future/scenario",
  evidence: "/evidence/card",
  proposal: "/proposal/values",
  provenance: "/trace/sources",
  trace: "/trace/calls",
} as const;

export const bind = (path: string): { path: string } => ({ path });

/** A single-surface answer: a root Column holding `body` in order. */
export function buildSurface(body: ComponentSpec[], surfaceId = "answer"): A2uiMessage[] {
  return [
    { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: CATALOG_ID } },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: [{ id: "root", component: "Column", children: body.map((c) => c.id) }, ...body],
      },
    },
  ];
}
