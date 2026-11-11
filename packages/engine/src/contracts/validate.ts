import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import assistantTools from "../../../../schemas/assistant-tools.schema.json";
import canonicalSeries from "../../../../schemas/canonical-series.schema.json";
import engineInput from "../../../../schemas/engine-input.schema.json";
import engineOutput from "../../../../schemas/engine-output.schema.json";
import evidenceCard from "../../../../schemas/evidence-card.schema.json";
import fieldBundle from "../../../../schemas/field-bundle.schema.json";
import provenance from "../../../../schemas/provenance.schema.json";
import type {
  AssistantToolCall,
  CanonicalSeries,
  EngineInput,
  EngineOutput,
  EvidenceCard,
  FieldBundle,
  Provenance,
} from "./types.generated";

export interface SchemaTypes {
  provenance: Provenance;
  "canonical-series": CanonicalSeries;
  "field-bundle": FieldBundle;
  "engine-input": EngineInput;
  "engine-output": EngineOutput;
  "evidence-card": EvidenceCard;
  "assistant-tools": AssistantToolCall;
}

export type SchemaName = keyof SchemaTypes;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const schemas: Record<SchemaName, object> = {
  provenance,
  "canonical-series": canonicalSeries,
  "field-bundle": fieldBundle,
  "engine-input": engineInput,
  "engine-output": engineOutput,
  "evidence-card": evidenceCard,
  "assistant-tools": assistantTools,
};

export const schemaNames = Object.keys(schemas) as SchemaName[];

const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword({ keyword: "x-schema-version", schemaType: "string" });
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

const idOf = (name: string) => `https://schemas.itza.space/${name}.schema.json`;

/**
 * Validate data against a contract schema by name, e.g. `validate("field-bundle", data)`.
 * A JSON Pointer fragment selects a definition, e.g. `"assistant-tools#/$defs/RunBacktestOutput"`.
 */
export function validate<K extends SchemaName>(
  schemaId: K,
  data: unknown,
): ValidationResult<SchemaTypes[K]>;
export function validate(schemaId: string, data: unknown): ValidationResult<unknown>;
export function validate(schemaId: string, data: unknown): ValidationResult<unknown> {
  const [name = "", fragment] = schemaId.split("#");
  const check = ajv.getSchema(idOf(name) + (fragment === undefined ? "" : `#${fragment}`));
  if (!check) return { ok: false, errors: [`Unknown schema: ${schemaId}`] };
  if (check(data)) return { ok: true, value: data };
  return {
    ok: false,
    errors: ajv.errorsText(check.errors, { separator: "\n", dataVar: "" }).split("\n"),
  };
}
