import { A2UI_VERSION, type ComponentName } from "./schemas";
import { type A2uiMessage, bind, buildSurface, DATA_PATHS } from "./surface";

const caption = (text: string) => ({ id: "cap", component: "Caption" as const, text });
const sources = { id: "src", component: "SourceChips" as const, data: bind(DATA_PATHS.provenance) };

/** One complete, valid example surface per component (few-shot material for the model). */
export const EXAMPLES: Record<ComponentName, A2uiMessage[]> = {
  Caption: buildSurface([caption("Your best rotation held up in most of the replayed seasons.")]),
  ReplayBars: buildSurface([
    caption("Each bar group is one past season; taller bars mean more stress."),
    {
      id: "bars",
      component: "ReplayBars",
      data: bind(DATA_PATHS.backtest),
      title: "Stress by season",
    },
    sources,
  ]),
  RotationCompare: buildSurface([
    caption("Here is how the candidate rotations compare side by side."),
    {
      id: "cmp",
      component: "RotationCompare",
      data: bind(DATA_PATHS.rotations),
      rotationIds: ["rot_a", "rot_b"],
    },
    sources,
  ]),
  EvidenceCard: buildSurface([
    caption("This card explains why the rotation was ranked this way."),
    { id: "ev", component: "EvidenceCard", data: bind(DATA_PATHS.evidence) },
  ]),
  SeasonSnapshot: buildSurface([
    caption("This is how that season compared with a normal year."),
    { id: "snap", component: "SeasonSnapshot", data: bind(DATA_PATHS.season), year: 2012 },
    sources,
  ]),
  ClimateStrip: buildSurface([
    caption("The strip shows monthly anomalies; the worst years are highlighted."),
    { id: "strip", component: "ClimateStrip", data: bind(DATA_PATHS.climate) },
  ]),
  FutureToggle: buildSurface([
    caption("Switch between today's climate and a plausible 2050 climate."),
    { id: "future", component: "FutureToggle", data: bind(DATA_PATHS.future), rotation: "rot_b" },
  ]),
  MapFocus: buildSurface([
    caption("The map now shows how the field divides into management zones."),
    { id: "map", component: "MapFocus", layer: "zones" },
  ]),
  ConfirmForm: buildSurface([
    caption("Check these values. Nothing changes until you press Confirm."),
    { id: "form", component: "ConfirmForm", data: bind(DATA_PATHS.proposal), kind: "priorities" },
  ]),
  ActionChips: buildSurface([
    caption("You can try one of these next."),
    {
      id: "chips",
      component: "ActionChips",
      chips: [
        {
          label: "Try barley instead",
          action: { name: "run_backtest", context: { rotation: "rot_barley" } },
        },
        { label: "Show 2050", action: { name: "open_future" } },
        { label: "Open in 3D", action: { name: "open_twin" } },
      ],
    },
  ]),
  SourceChips: buildSurface([caption("These are the data sources behind this answer."), sources]),
  TraceDrawer: buildSurface([
    caption("Open the drawer to see how this answer was made."),
    { id: "trace", component: "TraceDrawer", data: bind(DATA_PATHS.trace) },
  ]),
  Column: buildSurface([caption("One column holds the whole answer."), sources]),
  Row: surfaceWithLayout("Row"),
  Card: surfaceWithLayout("Card"),
};

/** Row and Card nest inside the root Column, so these examples build the tree by hand. */
function surfaceWithLayout(kind: "Row" | "Card"): A2uiMessage[] {
  const intro = caption("Two blocks sit together in one group.");
  const group = {
    id: "group",
    component: kind,
    children: ["cmp", "ev"],
    ...(kind === "Card" ? { title: "Rotation details" } : {}),
  };
  const [create] = buildSurface([intro]);
  return [
    create as A2uiMessage,
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: "answer",
        components: [
          { id: "root", component: "Column", children: ["cap", "group"] },
          intro,
          group,
          { id: "cmp", component: "RotationCompare", data: bind(DATA_PATHS.rotations) },
          { id: "ev", component: "EvidenceCard", data: bind(DATA_PATHS.evidence) },
        ],
      },
    },
  ];
}
