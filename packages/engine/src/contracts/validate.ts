import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { schemas } from "./generated/schemas";
import type { Contracts } from "./generated/types";

export type SchemaId = Exclude<keyof Contracts, "common">;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

const BASE = "https://itza.dev/schemas/";

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
addFormats(ajv);
// Version label of each schema, for example "field-bundle/1.0". Informational only.
ajv.addKeyword("x-version");
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

/** Checks `data` against a contract schema. Never throws on bad data; returns readable errors. */
export function validate<K extends SchemaId>(
  schemaId: K,
  data: unknown,
): ValidationResult<Contracts[K]> {
  const check = ajv.getSchema(`${BASE}${schemaId}.schema.json`);
  if (!check) throw new Error(`Unknown schema id: ${schemaId}`);
  if (check(data)) return { ok: true, data: data as Contracts[K] };
  return { ok: false, errors: ajv.errorsText(check.errors, { separator: "\n" }).split("\n") };
}
