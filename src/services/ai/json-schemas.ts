/** OpenAI strict JSON-schema helpers — all `value` fields need explicit types */

export const JSON_SCHEMA_SCALAR = {
  type: ["string", "number", "boolean", "null"],
} as const;

export const JSON_SCHEMA_STATUS_FIELD = {
  type: ["object", "null"],
  properties: {
    value: JSON_SCHEMA_SCALAR,
    status: { type: "string" },
  },
  required: ["value", "status"],
  additionalProperties: false,
} as const;

export const JSON_SCHEMA_CONSTRAINT_ITEM = {
  type: "object",
  properties: {
    field: { type: "string" },
    description: { type: "string" },
    value: JSON_SCHEMA_SCALAR,
  },
  required: ["field", "description", "value"],
  additionalProperties: false,
} as const;
