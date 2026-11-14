import { CommonSchemas } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { LIMITS, MAP_LAYERS } from "../schemas";

// The renderer-side description of each catalog component. It mirrors the JSON Schemas in
// `../schemas.ts`, which the gateway and the client check before anything reaches this renderer.
const id = z.string();
const data = CommonSchemas.DynamicValue;
const title = z.string().max(LIMITS.titleLength);

const action = z.object({
  name: z.string().max(48),
  context: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const CAPTION_API = { name: "Caption", schema: z.object({ text: z.string() }).strict() };
export const COLUMN_API = {
  name: "Column",
  schema: z.object({ children: CommonSchemas.ChildList }).strict(),
};
export const ROW_API = {
  name: "Row",
  schema: z.object({ children: CommonSchemas.ChildList }).strict(),
};
export const CARD_API = {
  name: "Card",
  schema: z.object({ children: CommonSchemas.ChildList, title }).partial({ title: true }).strict(),
};
export const REPLAY_BARS_API = {
  name: "ReplayBars",
  schema: z.object({ data, title: title.optional() }).strict(),
};
export const ROTATION_COMPARE_API = {
  name: "RotationCompare",
  schema: z.object({ data, rotationIds: z.array(id).optional() }).strict(),
};
export const EVIDENCE_CARD_API = { name: "EvidenceCard", schema: z.object({ data }).strict() };
export const SEASON_SNAPSHOT_API = {
  name: "SeasonSnapshot",
  schema: z.object({ data, year: z.number() }).strict(),
};
export const CLIMATE_STRIP_API = { name: "ClimateStrip", schema: z.object({ data }).strict() };
export const FUTURE_TOGGLE_API = {
  name: "FutureToggle",
  schema: z.object({ data, rotation: id }).strict(),
};
export const MAP_FOCUS_API = {
  name: "MapFocus",
  schema: z.object({ layer: z.enum(MAP_LAYERS) }).strict(),
};
export const CONFIRM_FORM_API = {
  name: "ConfirmForm",
  schema: z.object({ data, kind: z.enum(["priorities", "constraints"]) }).strict(),
};
export const ACTION_CHIPS_API = {
  name: "ActionChips",
  schema: z.object({ chips: z.array(z.object({ label: z.string(), action })) }).strict(),
};
export const SOURCE_CHIPS_API = { name: "SourceChips", schema: z.object({ data }).strict() };
export const TRACE_DRAWER_API = { name: "TraceDrawer", schema: z.object({ data }).strict() };
