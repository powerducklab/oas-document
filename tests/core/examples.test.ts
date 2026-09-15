import { describe, it, expect } from "vitest";

import {
  generateRequestExamples,
  buildOperationExample,
  buildCurlExample,
  buildJavaScriptExample,
  generateSchemaExample,
} from "../../src/core";
import type { OasOperation } from "../../src/core";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function makeOperation(overrides: Partial<OasOperation> = {}): OasOperation {
  return {
    id: "op1",
    path: "/users",
    method: "post",
    summary: "Create user",
    operationId: "createUser",
    deprecated: false,
    tags: ["users"],
    parameters: [],
    responses: { "201": { description: "Created" } },
    raw: {} as any,
    ...overrides,
  };
}

const serverUrl = "https://api.example.com";

/* -------------------------------------------------------------------------- */
/* generateRequestExamples                                                      */
/* -------------------------------------------------------------------------- */

describe("generateRequestExamples", () => {
  it("returns three examples: curl, javascript, and json", () => {
    const op = makeOperation();
    const examples = generateRequestExamples({} as any, op, serverUrl);
    expect(examples.length).toBe(3);
    expect(examples.map((e) => e.language)).toEqual([
      "curl",
      "javascript",
      "json",
    ]);
  });

  it("has human-readable labels", () => {
    const op = makeOperation();
    const examples = generateRequestExamples({} as any, op, serverUrl);
    expect(examples.map((e) => e.label)).toEqual(["cURL", "JavaScript", "JSON"]);
  });
});

/* -------------------------------------------------------------------------- */
/* buildCurlExample                                                             */
/* -------------------------------------------------------------------------- */

describe("buildCurlExample", () => {
  it("includes the HTTP method", () => {
    const op = makeOperation({ method: "post" });
    expect(buildCurlExample(op, serverUrl)).toContain("--request POST");
  });

  it("includes the URL", () => {
    const op = makeOperation({ path: "/users" });
    expect(buildCurlExample(op, serverUrl)).toContain(
      "--url 'https://api.example.com/users'",
    );
  });

  it("appends query parameters as placeholders", () => {
    const op = makeOperation({
      path: "/users",
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer" } } as any,
      ],
    });
    const result = buildCurlExample(op, serverUrl);
    expect(result).toContain("limit={limit}");
  });

  it("includes Content-Type header when requestBody has content", () => {
    const op = makeOperation({
      requestBody: {
        content: { "application/json": { schema: { type: "object" } } },
      } as any,
    });
    expect(buildCurlExample(op, serverUrl)).toContain(
      "--header 'Content-Type: application/json'",
    );
  });

  it("includes request body data", () => {
    const op = makeOperation({
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
      } as any,
    });
    const result = buildCurlExample(op, serverUrl);
    expect(result).toContain("--data");
    expect(result).toContain("name");
  });

  it("does not include data when there is no request body", () => {
    const op = makeOperation();
    const result = buildCurlExample(op, serverUrl);
    expect(result).not.toContain("--data");
  });

  it("strips trailing slash from serverUrl", () => {
    const op = makeOperation({ path: "/users" });
    expect(buildCurlExample(op, "https://api.example.com/")).toContain(
      "https://api.example.com/users",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* buildJavaScriptExample                                                      */
/* -------------------------------------------------------------------------- */

describe("buildJavaScriptExample", () => {
  it("includes a fetch call with the URL", () => {
    const op = makeOperation({ path: "/users" });
    const result = buildJavaScriptExample(op, serverUrl);
    expect(result).toContain('await fetch("https://api.example.com/users"');
  });

  it("includes the HTTP method", () => {
    const op = makeOperation({ method: "post" });
    const result = buildJavaScriptExample(op, serverUrl);
    expect(result).toContain('method: "POST"');
  });

  it("includes headers when requestBody exists", () => {
    const op = makeOperation({
      requestBody: {
        content: { "application/json": {} },
      } as any,
    });
    const result = buildJavaScriptExample(op, serverUrl);
    expect(result).toContain("headers:");
  });

  it("includes the body when requestBody exists", () => {
    const op = makeOperation({
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { name: { type: "string" } } },
          },
        },
      } as any,
    });
    const result = buildJavaScriptExample(op, serverUrl);
    expect(result).toContain("body: JSON.stringify(");
  });

  it("does not include body when there is no requestBody", () => {
    const op = makeOperation();
    const result = buildJavaScriptExample(op, serverUrl);
    expect(result).not.toContain("body:");
  });
});

/* -------------------------------------------------------------------------- */
/* buildOperationExample (JSON)                                                 */
/* -------------------------------------------------------------------------- */

describe("buildOperationExample", () => {
  it("produces valid JSON with method and url", () => {
    const op = makeOperation({ path: "/users" });
    const result = buildOperationExample(op, serverUrl);
    const parsed = JSON.parse(result);
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://api.example.com/users");
  });

  it("includes headers when requestBody has content", () => {
    const op = makeOperation({
      requestBody: {
        content: { "application/json": {} },
      } as any,
    });
    const result = buildOperationExample(op, serverUrl);
    const parsed = JSON.parse(result);
    expect(parsed.headers).toHaveProperty("Content-Type", "application/json");
  });

  it("includes a generated body when schema is provided", () => {
    const op = makeOperation({
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
      } as any,
    });
    const result = buildOperationExample(op, serverUrl);
    const parsed = JSON.parse(result);
    expect(parsed.body).toBeDefined();
    expect(parsed.body).toHaveProperty("name", "string");
  });
});

/* -------------------------------------------------------------------------- */
/* generateSchemaExample                                                        */
/* -------------------------------------------------------------------------- */

describe("generateSchemaExample", () => {
  it("returns null for null input", () => {
    expect(generateSchemaExample(undefined, null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(generateSchemaExample(undefined, undefined)).toBeNull();
  });

  it("returns null for non-record input", () => {
    expect(generateSchemaExample(undefined, "string-value")).toBeNull();
  });

  it("uses the explicit 'example' field", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", example: "hello" }),
    ).toBe("hello");
  });

  it("uses the first 'examples' item", () => {
    expect(
      generateSchemaExample(undefined, {
        type: "string",
        examples: ["a", "b"],
      }),
    ).toBe("a");
  });

  it("uses the 'default' value", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", default: "fallback" }),
    ).toBe("fallback");
  });

  it("uses the 'const' value", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", const: "fixed" }),
    ).toBe("fixed");
  });

  it("uses the first enum value", () => {
    expect(
      generateSchemaExample(undefined, {
        type: "string",
        enum: ["red", "green"],
      }),
    ).toBe("red");
  });

  it("generates 'string' for a plain string schema", () => {
    expect(generateSchemaExample(undefined, { type: "string" })).toBe("string");
  });

  it("generates 1 for an integer", () => {
    expect(generateSchemaExample(undefined, { type: "integer" })).toBe(1);
  });

  it("generates 1.5 for a number", () => {
    expect(generateSchemaExample(undefined, { type: "number" })).toBe(1.5);
  });

  it("generates true for a boolean", () => {
    expect(generateSchemaExample(undefined, { type: "boolean" })).toBe(true);
  });

  it("generates null for type null", () => {
    expect(generateSchemaExample(undefined, { type: "null" })).toBeNull();
  });

  it("generates an object from properties", () => {
    const result = generateSchemaExample(undefined, {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
    });
    expect(result).toEqual({ name: "string", age: 1 });
  });

  it("generates an array wrapper for array schemas", () => {
    const result = generateSchemaExample(undefined, {
      type: "array",
      items: { type: "string" },
    });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0]).toBe("string");
  });

  it("picks the first oneOf option", () => {
    const result = generateSchemaExample(undefined, {
      oneOf: [{ type: "string" }, { type: "integer" }],
    });
    expect(result).toBe("string");
  });

  it("picks the first anyOf option", () => {
    const result = generateSchemaExample(undefined, {
      anyOf: [{ type: "integer" }],
    });
    expect(result).toBe(1);
  });

  it("merges allOf options into one object", () => {
    const result = generateSchemaExample(undefined, {
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "integer" } } },
      ],
    });
    expect(result).toEqual({ a: "string", b: 1 });
  });

  it("generates a date string for date format", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", format: "date" }),
    ).toBe("2026-01-15");
  });

  it("generates a date-time string for date-time format", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", format: "date-time" }),
    ).toBe("2026-01-15T12:00:00Z");
  });

  it("generates an email for email format", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", format: "email" }),
    ).toBe("user@example.com");
  });

  it("generates a UUID for uuid format", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", format: "uuid" }),
    ).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("generates a URI for uri format", () => {
    expect(
      generateSchemaExample(undefined, { type: "string", format: "uri" }),
    ).toBe("https://example.com");
  });

  it("handles circular references gracefully", () => {
    const node: any = { type: "object", properties: {} };
    node.properties.child = node;
    const result = generateSchemaExample(undefined, node);
    expect(result).toBeDefined();
    // Should not throw
  });

  it("uses body-level example over schema generation", () => {
    const op = makeOperation({
      requestBody: {
        content: {
          "application/json": {
            example: { name: "from-example" },
            schema: { type: "object", properties: { name: { type: "string" } } },
          },
        },
      } as any,
    });
    const result = JSON.parse(buildOperationExample(op, serverUrl));
    expect(result.body).toEqual({ name: "from-example" });
  });
});
