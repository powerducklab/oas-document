import { describe, it, expect } from "vitest";
import { resolveSchemaRef, getDirectFields, buildExampleValue } from "../../src/react/libs/schema-display";
const document = { openapi: "3.2.0", info: { title: "Test", version: "1" }, paths: {} };

describe("schema rendering limits", () => {
  it("contains cyclic allOf objects", () => {
    const schema: { allOf: unknown[] } = { allOf: [] };
    schema.allOf.push(schema);
    expect(() => resolveSchemaRef(schema, document)).not.toThrow();
  });
  it("contains recursive array references", () => {
    const schema = { type: "array" as const, items: { $ref: "#/components/schemas/Loop" } };
    const doc = { ...document, components: { schemas: { Loop: schema } } };
    expect(getDirectFields(schema as never, doc)).toEqual([]);
  });
  it("does not resolve inherited JSON pointer properties", () => {
    expect(resolveSchemaRef({ $ref: "#/constructor" }, document)).toBeUndefined();
  });
  it("bounds generated example width", () => {
    const properties = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [String(i), { type: "string" }]));
    const value = buildExampleValue({ type: "object", properties }, document);
    expect(Object.keys(value as object).length).toBeLessThanOrEqual(1000);
  });
});

it("preserves reference siblings such as descriptions and read-only flags", () => {
  const doc = { ...document, components: { schemas: { Value: { type: "string" as const } } } };
  const value = resolveSchemaRef({ $ref: "#/components/schemas/Value", description: "Local description", readOnly: true }, doc);
  expect(value).toMatchObject({ type: "string", description: "Local description", readOnly: true });
});
