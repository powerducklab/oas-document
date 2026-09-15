import { describe, it, expect } from "vitest";

import {
  resolveSchema,
  getSchemaTypeLabel,
  getSchemaDescription,
  getSchemaTitle,
  getSchemaExample,
  getSchemaConstraints,
  getOperationSchemaFields,
  flattenSchemaFields,
  getParameterExample,
  getPrimaryMediaType,
  resolveServerUrl,
  isSchemaDeprecated,
  getSchemaFormat,
  getSchemaEnum,
  stringifyDisplayValue,
  stringifyJson,
} from "../../src/core";

/* -------------------------------------------------------------------------- */
/* resolveSchema (schema module)                                               */
/* -------------------------------------------------------------------------- */

describe("resolveSchema", () => {
  it("returns the schema when it is a plain record", () => {
    const schema = { type: "string" };
    expect(resolveSchema(schema)).toBe(schema);
  });

  it("returns undefined for a $ref object", () => {
    expect(resolveSchema({ $ref: "#/x" })).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(resolveSchema(null)).toBeUndefined();
  });

  it("returns undefined for a boolean", () => {
    expect(resolveSchema(true)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* getSchemaTypeLabel                                                          */
/* -------------------------------------------------------------------------- */

describe("getSchemaTypeLabel", () => {
  it("returns 'unknown' for undefined", () => {
    expect(getSchemaTypeLabel(undefined)).toBe("unknown");
  });

  it("returns the bare type for a string schema", () => {
    expect(getSchemaTypeLabel({ type: "string" })).toBe("string");
  });

  it("includes format when present", () => {
    expect(getSchemaTypeLabel({ type: "string", format: "email" })).toBe(
      "string (email)",
    );
  });

  it("returns 'integer' for integer type", () => {
    expect(getSchemaTypeLabel({ type: "integer" })).toBe("integer");
  });

  it("returns 'array' when items are absent", () => {
    expect(getSchemaTypeLabel({ type: "array" })).toBe("array");
  });

  it("appends [] for array with typed items", () => {
    expect(
      getSchemaTypeLabel({ type: "array", items: { type: "string" } }),
    ).toBe("string[]");
  });

  it("returns 'object' when properties are present without a type", () => {
    expect(
      getSchemaTypeLabel({ properties: { id: { type: "string" } } }),
    ).toBe("object");
  });

  it("returns 'enum' when enum array is present", () => {
    expect(getSchemaTypeLabel({ enum: ["a", "b", "c"] })).toBe("enum");
  });

  it("returns 'oneOf' for oneOf schemas", () => {
    expect(
      getSchemaTypeLabel({ oneOf: [{ type: "string" }, { type: "number" }] }),
    ).toBe("oneOf");
  });

  it("returns 'anyOf' for anyOf schemas", () => {
    expect(
      getSchemaTypeLabel({ anyOf: [{ type: "string" }] }),
    ).toBe("anyOf");
  });

  it("returns 'allOf' for allOf schemas", () => {
    expect(
      getSchemaTypeLabel({ allOf: [{ $ref: "#/x" }, { $ref: "#/y" }] }),
    ).toBe("allOf");
  });

  it("joins array types with ' | '", () => {
    expect(getSchemaTypeLabel({ type: ["string", "null"] })).toBe(
      "string | null",
    );
  });

  it("returns 'unknown' for an empty schema", () => {
    expect(getSchemaTypeLabel({})).toBe("unknown");
  });
});

/* -------------------------------------------------------------------------- */
/* getSchemaDescription / getSchemaTitle                                       */
/* -------------------------------------------------------------------------- */

describe("getSchemaDescription", () => {
  it("returns the description", () => {
    expect(
      getSchemaDescription({ type: "string", description: "A name" }),
    ).toBe("A name");
  });

  it("returns undefined for undefined schema", () => {
    expect(getSchemaDescription(undefined)).toBeUndefined();
  });

  it("returns undefined when description is absent", () => {
    expect(getSchemaDescription({ type: "string" })).toBeUndefined();
  });
});

describe("getSchemaTitle", () => {
  it("returns the title", () => {
    expect(getSchemaTitle({ title: "User", type: "object" })).toBe("User");
  });

  it("returns undefined for undefined schema", () => {
    expect(getSchemaTitle(undefined)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* getSchemaExample                                                            */
/* -------------------------------------------------------------------------- */

describe("getSchemaExample", () => {
  it("returns undefined for undefined schema", () => {
    expect(getSchemaExample(undefined)).toBeUndefined();
  });

  it("returns the 'example' property when present", () => {
    expect(
      getSchemaExample({ type: "string", example: "hello" }),
    ).toBe("hello");
  });

  it("returns the first item from 'examples' array", () => {
    expect(
      getSchemaExample({ type: "string", examples: ["a", "b"] }),
    ).toBe("a");
  });

  it("returns 'default' when no example is set", () => {
    expect(
      getSchemaExample({ type: "string", default: "fallback" }),
    ).toBe("fallback");
  });

  it("returns 'const' value", () => {
    expect(getSchemaExample({ type: "string", const: "fixed" })).toBe("fixed");
  });

  it("returns the first enum value", () => {
    expect(getSchemaExample({ type: "string", enum: ["x", "y"] })).toBe("x");
  });

  it("prefers example over default", () => {
    expect(
      getSchemaExample({
        type: "string",
        example: "ex",
        default: "def",
      }),
    ).toBe("ex");
  });

  it("returns undefined when no example-related fields exist", () => {
    expect(getSchemaExample({ type: "string" })).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* getSchemaConstraints                                                        */
/* -------------------------------------------------------------------------- */

describe("getSchemaConstraints", () => {
  it("returns an empty array for undefined", () => {
    expect(getSchemaConstraints(undefined)).toEqual([]);
  });

  it("collects numeric constraints", () => {
    const result = getSchemaConstraints({
      type: "integer",
      minimum: 1,
      maximum: 100,
      multipleOf: 5,
    });
    expect(result).toContain("minimum: 1");
    expect(result).toContain("maximum: 100");
    expect(result).toContain("multipleOf: 5");
  });

  it("collects string constraints", () => {
    const result = getSchemaConstraints({
      type: "string",
      minLength: 2,
      maxLength: 50,
      pattern: "^[a-z]+$",
    });
    expect(result).toContain("minLength: 2");
    expect(result).toContain("maxLength: 50");
    expect(result).toContain("pattern: ^[a-z]+$");
  });

  it("collects array constraints", () => {
    const result = getSchemaConstraints({
      type: "array",
      minItems: 1,
      maxItems: 10,
    });
    expect(result).toContain("minItems: 1");
    expect(result).toContain("maxItems: 10");
  });

  it("ignores absent constraints", () => {
    expect(getSchemaConstraints({ type: "string" })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* flattenSchemaFields / getOperationSchemaFields                              */
/* -------------------------------------------------------------------------- */

describe("getOperationSchemaFields", () => {
  const schema: any = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
      address: {
        type: "object",
        properties: {
          street: { type: "string" },
          zip: { type: "string" },
        },
      },
    },
    required: ["name"],
  };

  it("returns an empty array for undefined", () => {
    expect(getOperationSchemaFields(undefined)).toEqual([]);
  });

  it("flattens top-level properties", () => {
    const fields = getOperationSchemaFields(schema);
    const names = fields.map((f) => f.name);
    expect(names).toContain("name");
    expect(names).toContain("age");
    expect(names).toContain("address");
  });

  it("marks required fields", () => {
    const fields = getOperationSchemaFields(schema);
    const nameField = fields.find((f) => f.name === "name")!;
    expect(nameField.required).toBe(true);
  });

  it("marks optional fields as not required", () => {
    const fields = getOperationSchemaFields(schema);
    const ageField = fields.find((f) => f.name === "age")!;
    expect(ageField.required).toBe(false);
  });

  it("includes nested properties with increased depth and dotted paths", () => {
    const fields = getOperationSchemaFields(schema);
    const streetField = fields.find((f) => f.name === "street")!;
    expect(streetField.depth).toBe(1);
    expect(streetField.path).toBe("address.street");
  });

  it("handles schemas without properties", () => {
    expect(getOperationSchemaFields({ type: "string" })).toEqual([]);
  });
});

describe("flattenSchemaFields circular protection", () => {
  it("does not infinite-loop on self-referencing schemas", () => {
    const node: any = { type: "object", properties: {} };
    node.properties.child = node; // self-reference
    const fields = flattenSchemaFields(node);
    // Should return quickly without throwing
    expect(Array.isArray(fields)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* getParameterExample                                                         */
/* -------------------------------------------------------------------------- */

describe("getParameterExample", () => {
  it("returns the direct 'example' property", () => {
    const param: any = { name: "id", in: "path", example: "user-123" };
    expect(getParameterExample(param)).toBe("user-123");
  });

  it("returns undefined when no example is present", () => {
    const param: any = { name: "id", in: "path" };
    expect(getParameterExample(param)).toBeUndefined();
  });

  it("returns the value from the 'examples' object", () => {
    const param: any = {
      name: "id",
      in: "path",
      examples: {
        first: { value: "example-value" },
      },
    };
    expect(getParameterExample(param)).toBe("example-value");
  });
});

/* -------------------------------------------------------------------------- */
/* getPrimaryMediaType                                                         */
/* -------------------------------------------------------------------------- */

describe("getPrimaryMediaType", () => {
  it("returns undefined for undefined content", () => {
    expect(getPrimaryMediaType(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty content object", () => {
    expect(getPrimaryMediaType({})).toBeUndefined();
  });

  it("prefers application/json", () => {
    const content: Record<string, any> = {
      "text/plain": { schema: { type: "string" } },
      "application/json": { schema: { type: "object" } },
    };
    const result = getPrimaryMediaType(content);
    expect(result?.[0]).toBe("application/json");
  });

  it("is case-insensitive for JSON detection", () => {
    const content: Record<string, any> = {
      "APPLICATION/JSON": { schema: { type: "object" } },
    };
    const result = getPrimaryMediaType(content);
    expect(result?.[0]).toBe("APPLICATION/JSON");
  });

  it("falls back to the first entry when no JSON exists", () => {
    const content: Record<string, any> = {
      "text/plain": { schema: { type: "string" } },
    };
    const result = getPrimaryMediaType(content);
    expect(result?.[0]).toBe("text/plain");
  });
});

/* -------------------------------------------------------------------------- */
/* resolveServerUrl                                                            */
/* -------------------------------------------------------------------------- */

describe("resolveServerUrl", () => {
  it("returns the URL unchanged when variables are not a record", () => {
    expect(resolveServerUrl("https://api.example.com", null)).toBe(
      "https://api.example.com",
    );
  });

  it("substitutes variable defaults in the URL", () => {
    expect(
      resolveServerUrl("https://{env}.example.com", {
        env: { default: "staging" },
      }),
    ).toBe("https://staging.example.com");
  });

  it("leaves variables without a default as placeholders", () => {
    expect(
      resolveServerUrl("https://{env}.example.com", {
        env: {},
      }),
    ).toBe("https://{env}.example.com");
  });
});

/* -------------------------------------------------------------------------- */
/* Schema metadata helpers                                                     */
/* -------------------------------------------------------------------------- */

describe("isSchemaDeprecated", () => {
  it("returns false for undefined", () => {
    expect(isSchemaDeprecated(undefined)).toBe(false);
  });

  it("returns true when deprecated is true", () => {
    expect(isSchemaDeprecated({ type: "string", deprecated: true })).toBe(true);
  });

  it("returns false when deprecated is false", () => {
    expect(isSchemaDeprecated({ type: "string", deprecated: false })).toBe(false);
  });
});

describe("getSchemaFormat", () => {
  it("returns the format", () => {
    expect(getSchemaFormat({ type: "string", format: "date-time" })).toBe(
      "date-time",
    );
  });

  it("returns undefined for undefined schema", () => {
    expect(getSchemaFormat(undefined)).toBeUndefined();
  });
});

describe("getSchemaEnum", () => {
  it("returns the enum array", () => {
    expect(getSchemaEnum({ type: "string", enum: ["a", "b"] })).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns an empty array when enum is absent", () => {
    expect(getSchemaEnum({ type: "string" })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Stringification helpers                                                     */
/* -------------------------------------------------------------------------- */

describe("stringifyJson", () => {
  it("serializes an object", () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("returns an empty string for circular references", () => {
    const obj: any = {};
    obj.self = obj;
    expect(stringifyJson(obj)).toBe("");
  });
});

describe("stringifyDisplayValue", () => {
  it("returns a string as-is", () => {
    expect(stringifyDisplayValue("hello")).toBe("hello");
  });

  it("JSON-stringifies an object", () => {
    expect(stringifyDisplayValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("stringifies a number", () => {
    expect(stringifyDisplayValue(42)).toBe("42");
  });

  it("handles null", () => {
    expect(stringifyDisplayValue(null)).toBe("null");
  });
});
