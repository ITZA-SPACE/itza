/**
 * JSON Schemas for the A2UI answer catalog `app-catalog/v1` (A2UI v0.9.1 message shapes).
 * The model may only place these components. Data props are bound by JSON Pointer to the surface
 * data model, so numbers in charts never pass through the model's text.
 */
export const CATALOG_ID = "app-catalog/v1";
export const A2UI_VERSION = "v0.9";

export type JsonSchema = Record<string, unknown>;

export const LAYOUT_COMPONENTS = ["Column", "Row", "Card"] as const;
export const DATA_COMPONENTS = [
  "ReplayBars",
  "RotationCompare",
  "EvidenceCard",
  "SeasonSnapshot",
  "ClimateStrip",
  "FutureToggle",
  "MapFocus",
  "ConfirmForm",
] as const;
export const FOOTER_COMPONENTS = ["ActionChips", "SourceChips", "TraceDrawer"] as const;
export const COMPONENT_NAMES = [
  "Caption",
  ...DATA_COMPONENTS,
  ...FOOTER_COMPONENTS,
  ...LAYOUT_COMPONENTS,
] as const;

export type ComponentName = (typeof COMPONENT_NAMES)[number];

export const MAP_LAYERS = [
  "zones",
  "ndvi",
  "moisture",
  "rain_anomaly",
  "heat_days",
  "frost_days",
] as const;

export const LIMITS = {
  messages: 32,
  components: 40,
  children: 12,
  chips: 4,
  maxDataComponents: 3,
  maxDepth: 4,
  textLength: 400,
  titleLength: 80,
  labelLength: 40,
  dataValueBytes: 8_000,
} as const;

const id = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,31}$" };
const pointer = { type: "string", maxLength: 128, pattern: "^(/[A-Za-z0-9_.~-]+)+$" };
const binding = {
  type: "object",
  properties: { path: pointer },
  required: ["path"],
  additionalProperties: false,
};
const title = { type: "string", minLength: 1, maxLength: LIMITS.titleLength };
const action = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 48 },
    context: {
      type: "object",
      maxProperties: 6,
      additionalProperties: {
        anyOf: [{ type: "string", maxLength: 120 }, { type: "number" }, { type: "boolean" }],
      },
    },
  },
  required: ["name"],
  additionalProperties: false,
};
const children = {
  type: "array",
  items: id,
  minItems: 1,
  maxItems: LIMITS.children,
  uniqueItems: true,
};

function component(
  name: ComponentName,
  props: Record<string, unknown>,
  required: string[] = [],
): JsonSchema {
  return {
    type: "object",
    properties: { id, component: { const: name }, ...props },
    required: ["id", "component", ...required],
    additionalProperties: false,
  };
}

export const COMPONENT_SCHEMAS: Record<ComponentName, JsonSchema> = {
  Caption: component(
    "Caption",
    { text: { type: "string", minLength: 1, maxLength: LIMITS.textLength } },
    ["text"],
  ),
  ReplayBars: component("ReplayBars", { data: binding, title }, ["data"]),
  RotationCompare: component(
    "RotationCompare",
    {
      data: binding,
      rotationIds: { type: "array", items: id, minItems: 2, maxItems: 4, uniqueItems: true },
    },
    ["data"],
  ),
  EvidenceCard: component("EvidenceCard", { data: binding }, ["data"]),
  SeasonSnapshot: component(
    "SeasonSnapshot",
    { data: binding, year: { type: "integer", minimum: 1980, maximum: 2100 } },
    ["data", "year"],
  ),
  ClimateStrip: component("ClimateStrip", { data: binding }, ["data"]),
  FutureToggle: component("FutureToggle", { data: binding, rotation: id }, ["data", "rotation"]),
  MapFocus: component("MapFocus", { layer: { enum: [...MAP_LAYERS] } }, ["layer"]),
  ConfirmForm: component(
    "ConfirmForm",
    { data: binding, kind: { enum: ["priorities", "constraints"] } },
    ["data", "kind"],
  ),
  ActionChips: component(
    "ActionChips",
    {
      chips: {
        type: "array",
        minItems: 1,
        maxItems: LIMITS.chips,
        items: {
          type: "object",
          properties: {
            label: { type: "string", minLength: 1, maxLength: LIMITS.labelLength },
            action,
          },
          required: ["label", "action"],
          additionalProperties: false,
        },
      },
    },
    ["chips"],
  ),
  SourceChips: component("SourceChips", { data: binding }, ["data"]),
  TraceDrawer: component("TraceDrawer", { data: binding }, ["data"]),
  Column: component("Column", { children }, ["children"]),
  Row: component("Row", { children }, ["children"]),
  Card: component("Card", { children, title }, ["children"]),
};

/** Envelope of one A2UI message: `version` plus exactly one of the three message bodies. */
export const MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    version: { const: A2UI_VERSION },
    createSurface: {
      type: "object",
      properties: { surfaceId: id, catalogId: { const: CATALOG_ID } },
      required: ["surfaceId", "catalogId"],
      additionalProperties: false,
    },
    updateComponents: {
      type: "object",
      properties: {
        surfaceId: id,
        components: {
          type: "array",
          minItems: 1,
          maxItems: LIMITS.components,
          items: { type: "object" },
        },
      },
      required: ["surfaceId", "components"],
      additionalProperties: false,
    },
    updateDataModel: {
      type: "object",
      properties: { surfaceId: id, path: pointer, value: {} },
      required: ["surfaceId", "path", "value"],
      additionalProperties: false,
    },
  },
  required: ["version"],
  additionalProperties: false,
  oneOf: [
    { required: ["createSurface"] },
    { required: ["updateComponents"] },
    { required: ["updateDataModel"] },
  ],
};
