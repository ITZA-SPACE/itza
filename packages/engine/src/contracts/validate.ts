import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import assistantTools from "../../../../schemas/assistant-tools.schema.json" with { type: "json" };
import canonicalSeries from "../../../../schemas/canonical-series.schema.json" with {
  type: "json",
};
import common from "../../../../schemas/common.schema.json" with { type: "json" };
import engineInput from "../../../../schemas/engine-input.schema.json" with { type: "json" };
import engineOutput from "../../../../schemas/engine-output.schema.json" with { type: "json" };
import evidenceCard from "../../../../schemas/evidence-card.schema.json" with { type: "json" };
import fieldBundle from "../../../../schemas/field-bundle.schema.json" with { type: "json" };
import provenance from "../../../../schemas/provenance.schema.json" with { type: "json" };
import type {
  AssistantToolMessage,
  CanonicalSeries,
  EngineInput,
  EngineOutput,
  EvidenceCard,
  FieldBundle,
  Provenance,
} from "./index.ts";

const SCHEMAS = [
  common,
  provenance,
  canonicalSeries,
  fieldBundle,
  engineInput,
  engineOutput,
  evidenceCard,
  assistantTools,
];

/** Maps each schema id to the type it validates. */
export interface SchemaTypes {
  provenance: Provenance;
  "canonical-series": CanonicalSeries;
  "field-bundle": FieldBundle;
  "engine-input": EngineInput;
  "engine-output": EngineOutput;
  "evidence-card": EvidenceCard;
  "assistant-tools": AssistantToolMessage;
}

export type SchemaId = keyof SchemaTypes;

export const SCHEMA_IDS: readonly SchemaId[] = [
  "provenance",
  "canonical-series",
  "field-bundle",
  "engine-input",
  "engine-output",
  "evidence-card",
  "assistant-tools",
];

export class ContractValidationError extends Error {
  readonly schemaId: SchemaId;
  readonly errors: readonly ErrorObject[];

  constructor(schemaId: SchemaId, errors: readonly ErrorObject[]) {
    const detail = errors
      .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
      .join("; ");
    super(`Invalid ${schemaId}: ${detail}`);
    this.name = "ContractValidationError";
    this.schemaId = schemaId;
    this.errors = errors;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword({ keyword: "x-version" });
for (const schema of SCHEMAS) ajv.addSchema(schema);

const schemaUri = (id: SchemaId): string => `https://itza.app/schemas/${id}.schema.json`;

/** Validates `data` against the named schema and returns it typed, or throws. */
export function validate<K extends SchemaId>(schemaId: K, data: unknown): SchemaTypes[K] {
  const check = ajv.getSchema(schemaUri(schemaId));
  if (check === undefined) throw new Error(`Unknown schema: ${schemaId}`);
  if (!check(data)) throw new ContractValidationError(schemaId, check.errors ?? []);
  return data as SchemaTypes[K];
}
