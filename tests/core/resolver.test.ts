import { describe, it, expect } from "vitest";

import {
  resolveJsonPointer,
  isLocalReference,
  isExternalReference,
  resolveReference,
  resolveReferenceOrOriginal,
  resolveOasValue,
  createOasResolveContext,
  resolveSchemaReference,
  resolveParameter,
  resolveRequestBody,
  resolveResponse,
  resolveHeader,
  resolveExample,
  getComponents,
  getComponentCollection,
  getComponent,
  getProperty,
  getStringProperty,
  getBooleanProperty,
  getArrayProperty,
  getObjectProperty,
} from "../../src/core";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const document: any = {
  openapi: "3.2.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: { operationId: "listUsers", responses: { "200": { description: "OK" } } },
    },
  },
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      Address: {
        type: "object",
        properties: {
          street: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      CircularNode: {
        type: "object",
        properties: {
          name: { type: "string" },
          child: { $ref: "#/components/schemas/CircularNode" },
        },
      },
      "My/Schema": {
        type: "string",
      },
    },
    parameters: {
      PageSize: { name: "pageSize", in: "query", schema: { type: "integer" } },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* resolveJsonPointer                                                          */
/* -------------------------------------------------------------------------- */

describe("resolveJsonPointer", () => {
  it("returns the root when reference is '#'", () => {
    expect(resolveJsonPointer(document, "#")).toBe(document);
  });

  it("resolves a simple nested pointer", () => {
    const result = resolveJsonPointer(document, "#/info/title");
    expect(result).toBe("Test API");
  });

  it("resolves a deep nested pointer", () => {
    const result = resolveJsonPointer(
      document,
      "#/components/schemas/User/type",
    );
    expect(result).toBe("object");
  });

  it("returns undefined for a non-local pointer", () => {
    expect(resolveJsonPointer(document, "https://example.com/schema.json#/x")).toBeUndefined();
  });

  it("returns undefined for a missing segment", () => {
    expect(resolveJsonPointer(document, "#/components/schemas/User/nonexistent")).toBeUndefined();
  });

  it("returns undefined when traversing through a non-record", () => {
    // info/title is a string, so /info/title/foo should fail
    expect(resolveJsonPointer(document, "#/info/title/foo")).toBeUndefined();
  });

  it("handles ~1 escaping in pointer segments", () => {
    const result = resolveJsonPointer(
      document,
      "#/components/schemas/My~1Schema",
    );
    expect(result).toEqual({ type: "string" });
  });
});

/* -------------------------------------------------------------------------- */
/* Reference classification                                                    */
/* -------------------------------------------------------------------------- */

describe("isLocalReference", () => {
  it("returns true for '#'", () => {
    expect(isLocalReference("#")).toBe(true);
  });

  it("returns true for '#/...' pointers", () => {
    expect(isLocalReference("#/components/schemas/User")).toBe(true);
  });

  it("returns false for external URLs", () => {
    expect(isLocalReference("https://example.com/schema.json")).toBe(false);
  });
});

describe("isExternalReference", () => {
  it("returns true for http URLs", () => {
    expect(isExternalReference("https://example.com/schema.json")).toBe(true);
  });

  it("returns false for local pointers", () => {
    expect(isExternalReference("#/components/schemas/User")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Shallow resolution                                                          */
/* -------------------------------------------------------------------------- */

describe("resolveReference", () => {
  it("returns non-ref values as-is", () => {
    const value = { type: "string" };
    expect(resolveReference(document, value)).toBe(value);
  });

  it("resolves a local $ref", () => {
    const ref = { $ref: "#/components/schemas/User" };
    const resolved = resolveReference<any>(document, ref);
    expect(resolved).toEqual({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
    });
  });

  it("returns undefined for external $ref", () => {
    const ref = { $ref: "https://example.com/schema.json" };
    expect(resolveReference(document, ref)).toBeUndefined();
  });

  it("returns undefined for a $ref to a non-existent path", () => {
    const ref = { $ref: "#/components/schemas/NonExistent" };
    expect(resolveReference(document, ref)).toBeUndefined();
  });
});

describe("resolveReferenceOrOriginal", () => {
  it("returns non-ref values as-is", () => {
    const value = { type: "integer" };
    expect(resolveReferenceOrOriginal(document, value)).toBe(value);
  });

  it("resolves a local $ref successfully", () => {
    const ref = { $ref: "#/components/schemas/User" };
    const resolved = resolveReferenceOrOriginal<any>(document, ref);
    expect(resolved).toHaveProperty("type", "object");
  });

  it("falls back to the original value when ref cannot be resolved", () => {
    const ref = { $ref: "#/components/schemas/NonExistent", description: "fallback" };
    const resolved = resolveReferenceOrOriginal<any>(document, ref);
    expect(resolved).toEqual(ref);
  });

  it("falls back to original for external refs", () => {
    const ref = { $ref: "https://example.com/ext.json" };
    const resolved = resolveReferenceOrOriginal<any>(document, ref);
    expect(resolved).toEqual(ref);
  });
});

/* -------------------------------------------------------------------------- */
/* Recursive resolution                                                        */
/* -------------------------------------------------------------------------- */

describe("resolveOasValue", () => {
  const context = createOasResolveContext(document);

  it("returns undefined for null input", () => {
    expect(resolveOasValue(context, null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(resolveOasValue(context, undefined)).toBeUndefined();
  });

  it("resolves a simple $ref", () => {
    const result = resolveOasValue<any>(context, {
      $ref: "#/components/schemas/User",
    });
    expect(result).toHaveProperty("type", "object");
  });

  it("resolves nested $refs", () => {
    const result = resolveOasValue<any>(context, {
      $ref: "#/components/schemas/Address",
    });
    expect(result.properties.user).toHaveProperty("type", "object");
    expect(result.properties.user.properties).toHaveProperty("id");
  });

  it("handles circular references without infinite recursion", () => {
    const result = resolveOasValue<any>(context, {
      $ref: "#/components/schemas/CircularNode",
    });
    // The outer resolution succeeds; the inner circular $ref is preserved
    expect(result).toHaveProperty("type", "object");
    expect(result.properties.name).toEqual({ type: "string" });
    // The child field should remain a $ref (circular guard)
    expect(result.properties.child).toHaveProperty("$ref", "#/components/schemas/CircularNode");
  });

  it("preserves external references as-is", () => {
    const extRef = { $ref: "https://example.com/ext.json" };
    const result = resolveOasValue<any>(context, extRef);
    expect(result).toEqual(extRef);
  });

  it("preserves $ref to non-existent paths", () => {
    const badRef = { $ref: "#/components/schemas/DoesNotExist" };
    const result = resolveOasValue<any>(context, badRef);
    expect(result).toEqual(badRef);
  });

  it("merges sibling properties onto a resolved $ref", () => {
    const result = resolveOasValue<any>(context, {
      $ref: "#/components/schemas/User",
      description: "The current user",
    });
    expect(result).toHaveProperty("description", "The current user");
    expect(result).toHaveProperty("type", "object");
  });

  it("does not mutate the original document", () => {
    const before = JSON.parse(
      JSON.stringify(document.components.schemas.User),
    );
    resolveOasValue<any>(context, { $ref: "#/components/schemas/User", description: "mutated?" });
    expect(document.components.schemas.User).toEqual(before);
  });

  it("resolves arrays of values", () => {
    const result = resolveOasValue<any>(context, [
      { $ref: "#/components/schemas/User" },
      { type: "string" },
    ]);
    expect(result[0]).toHaveProperty("type", "object");
    expect(result[1]).toEqual({ type: "string" });
  });
});

/* -------------------------------------------------------------------------- */
/* Typed resolver wrappers                                                     */
/* -------------------------------------------------------------------------- */

describe("resolveSchemaReference", () => {
  it("resolves a schema with nested $refs", () => {
    const result = resolveSchemaReference(document, {
      $ref: "#/components/schemas/Address",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("type", "object");
  });

  it("returns undefined for null schema", () => {
    expect(resolveSchemaReference(document, null)).toBeUndefined();
  });

  it("returns undefined for undefined schema", () => {
    expect(resolveSchemaReference(document, undefined)).toBeUndefined();
  });

  it("returns the schema as-is when it is not a $ref", () => {
    const result = resolveSchemaReference(document, { type: "string" });
    expect(result).toEqual({ type: "string" });
  });
});

describe("resolveParameter", () => {
  it("resolves a parameter $ref", () => {
    const result = resolveParameter(document, {
      $ref: "#/components/parameters/PageSize",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("name", "pageSize");
  });

  it("returns undefined for null input", () => {
    expect(resolveParameter(document, null)).toBeUndefined();
  });
});

describe("resolveRequestBody", () => {
  it("resolves a request body object", () => {
    const result = resolveRequestBody(document, {
      description: "user body",
      content: { "application/json": { schema: { type: "object" } } },
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("description", "user body");
  });
});

describe("resolveResponse", () => {
  it("resolves a response object", () => {
    const result = resolveResponse(document, {
      description: "OK",
      content: { "application/json": {} },
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("description", "OK");
  });
});

describe("resolveHeader", () => {
  it("resolves a header object", () => {
    const result = resolveHeader(document, {
      description: "Rate limit",
      schema: { type: "integer" },
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("description", "Rate limit");
  });
});

describe("resolveExample", () => {
  it("resolves an example object", () => {
    const result = resolveExample(document, {
      summary: "admin user",
      value: { id: "1", name: "Admin" },
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("summary", "admin user");
  });
});

/* -------------------------------------------------------------------------- */
/* Component accessors                                                         */
/* -------------------------------------------------------------------------- */

describe("getComponents", () => {
  it("returns the components object", () => {
    expect(getComponents(document)).toBe(document.components);
  });

  it("returns undefined when components is absent", () => {
    expect(getComponents({ paths: {} } as any)).toBeUndefined();
  });
});

describe("getComponentCollection", () => {
  it("returns a named collection", () => {
    expect(getComponentCollection(document, "schemas")).toBe(
      document.components.schemas,
    );
  });

  it("returns undefined when collection does not exist", () => {
    expect(getComponentCollection(document, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when components is absent", () => {
    expect(getComponentCollection({} as any, "schemas")).toBeUndefined();
  });
});

describe("getComponent", () => {
  it("returns a named component", () => {
    expect(getComponent(document, "schemas", "User")).toEqual(
      document.components.schemas.User,
    );
  });

  it("returns undefined for a missing component", () => {
    expect(getComponent(document, "schemas", "Nope")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Generic property helpers                                                    */
/* -------------------------------------------------------------------------- */

describe("getProperty", () => {
  it("returns a property from a record", () => {
    expect(getProperty({ a: 1 }, "a")).toBe(1);
  });

  it("returns undefined for a non-record", () => {
    expect(getProperty("not an object", "a")).toBeUndefined();
  });

  it("returns undefined when key is missing", () => {
    expect(getProperty({ a: 1 }, "b")).toBeUndefined();
  });
});

describe("getStringProperty", () => {
  it("returns the string value", () => {
    expect(getStringProperty({ name: "foo" }, "name")).toBe("foo");
  });

  it("returns undefined when value is not a string", () => {
    expect(getStringProperty({ name: 42 }, "name")).toBeUndefined();
  });

  it("returns undefined for a non-record", () => {
    expect(getStringProperty(null, "name")).toBeUndefined();
  });
});

describe("getBooleanProperty", () => {
  it("returns the boolean value", () => {
    expect(getBooleanProperty({ deprecated: true }, "deprecated")).toBe(true);
  });

  it("returns undefined when value is not boolean", () => {
    expect(getBooleanProperty({ deprecated: "yes" }, "deprecated")).toBeUndefined();
  });
});

describe("getArrayProperty", () => {
  it("returns the array", () => {
    expect(getArrayProperty({ tags: ["a", "b"] }, "tags")).toEqual(["a", "b"]);
  });

  it("returns undefined when value is not an array", () => {
    expect(getArrayProperty({ tags: "a,b" }, "tags")).toBeUndefined();
  });
});

describe("getObjectProperty", () => {
  it("returns the object", () => {
    expect(getObjectProperty({ info: { title: "x" } }, "info")).toEqual({
      title: "x",
    });
  });

  it("returns undefined when value is an array", () => {
    expect(getObjectProperty({ items: [1, 2] }, "items")).toBeUndefined();
  });

  it("returns undefined when value is null", () => {
    expect(getObjectProperty({ info: null }, "info")).toBeUndefined();
  });
});

describe("hostile object boundaries", () => {
  it("does not resolve inherited object properties", () => {
    expect(resolveJsonPointer({}, "#/constructor")).toBeUndefined();
    expect(resolveJsonPointer({}, "#/__proto__")).toBeUndefined();
  });
});
