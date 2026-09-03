/**
 * TURN_SCHEMA Regression Tests
 *
 * OpenAI Structured Outputs strict mode requirements:
 * 1. Every object: additionalProperties must be false
 * 2. Every object: required array must exist
 * 3. required must contain ALL keys in properties
 * 4. Optional fields must be nullable (not absent from required)
 *
 * These tests must FAIL if the schema violates any of these rules.
 * They exist because turn_interpret was silently broken for >1 week
 * (400 errors falling to fallback) due to a schema violation.
 */

import { describe, it, expect } from "vitest";

// Extract TURN_SCHEMA from the module without importing server-only deps
// We re-export just the schema for testing
import { TURN_SCHEMA_FOR_TEST } from "../src/services/assistant/turn-interpreter-schema";

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode;
  enum?: unknown[];
  anyOf?: JsonSchemaNode[];
};

/**
 * Recursively validate a JSON Schema node for OpenAI Structured Outputs compatibility.
 * Returns list of violations (empty = valid).
 */
function validateStrictSchema(
  node: JsonSchemaNode,
  path: string
): string[] {
  const errors: string[] = [];

  if (node.type === "object" || node.properties) {
    // Rule 1: additionalProperties must be false
    if (node.additionalProperties !== false) {
      errors.push(
        `${path}: 'additionalProperties' must be false (got ${JSON.stringify(node.additionalProperties)})`
      );
    }

    // Rule 2: required array must exist
    if (!Array.isArray(node.required)) {
      errors.push(`${path}: 'required' array is missing`);
    } else if (node.properties) {
      // Rule 3: required must include ALL property keys
      const propKeys = Object.keys(node.properties);
      const missingFromRequired = propKeys.filter(
        (k) => !node.required!.includes(k)
      );
      if (missingFromRequired.length > 0) {
        errors.push(
          `${path}: 'required' is missing keys: ${missingFromRequired.join(", ")}`
        );
      }

      // Recurse into each property
      for (const [key, child] of Object.entries(node.properties)) {
        errors.push(...validateStrictSchema(child, `${path}.properties.${key}`));
      }
    }
  }

  // Recurse into array items
  if (node.items && typeof node.items === "object") {
    errors.push(...validateStrictSchema(node.items as JsonSchemaNode, `${path}.items`));
  }

  // Recurse into anyOf branches
  if (Array.isArray(node.anyOf)) {
    for (let i = 0; i < node.anyOf.length; i++) {
      errors.push(
        ...validateStrictSchema(node.anyOf[i], `${path}.anyOf[${i}]`)
      );
    }
  }

  return errors;
}

describe("TURN_SCHEMA — OpenAI Structured Outputs compliance", () => {
  it("passes recursive strict schema validation (no violations)", () => {
    const violations = validateStrictSchema(
      TURN_SCHEMA_FOR_TEST as unknown as JsonSchemaNode,
      "root"
    );

    if (violations.length > 0) {
      // Print all violations before failing
      console.error("SCHEMA VIOLATIONS DETECTED:");
      violations.forEach((v) => console.error("  •", v));
    }

    expect(violations).toHaveLength(0);
  });

  it("root object has additionalProperties: false", () => {
    expect((TURN_SCHEMA_FOR_TEST as Record<string, unknown>).additionalProperties).toBe(false);
  });

  it("root object has required array", () => {
    expect(Array.isArray((TURN_SCHEMA_FOR_TEST as Record<string, unknown>).required)).toBe(true);
  });

  it("extractedFacts nested object has required array with all property keys", () => {
    const schema = TURN_SCHEMA_FOR_TEST as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const facts = props.extractedFacts;
    expect(facts).toBeDefined();
    expect(facts.additionalProperties).toBe(false);
    const factProps = Object.keys(facts.properties as object);
    const factRequired = facts.required as string[];
    for (const key of factProps) {
      expect(factRequired).toContain(key);
    }
  });

  it("correctedFacts nested object has required array with all property keys", () => {
    const schema = TURN_SCHEMA_FOR_TEST as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const facts = props.correctedFacts;
    expect(facts).toBeDefined();
    expect(facts.additionalProperties).toBe(false);
    const factProps = Object.keys(facts.properties as object);
    const factRequired = facts.required as string[];
    for (const key of factProps) {
      expect(factRequired).toContain(key);
    }
  });

  it("all required fields in root include: relation, intent, targetCapability, confirms, cancels, confidenceOverall", () => {
    const schema = TURN_SCHEMA_FOR_TEST as Record<string, unknown>;
    const required = schema.required as string[];
    const mustHave = [
      "relation",
      "intent",
      "targetCapability",
      "confirms",
      "cancels",
      "confidenceOverall",
    ];
    for (const field of mustHave) {
      expect(required).toContain(field);
    }
  });

  it("CONTEXT_QUESTION is in the relation enum", () => {
    const schema = TURN_SCHEMA_FOR_TEST as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const relation = props.relation;
    expect(relation.enum).toContain("CONTEXT_QUESTION");
  });

  it("questionAbout is in the schema properties and in required", () => {
    const schema = TURN_SCHEMA_FOR_TEST as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.questionAbout).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain("questionAbout");
  });
});
