import { describe, it, expect } from "vitest";

import {
  isRecord,
  isReferenceLike,
  isSchemaRecord,
  HTTP_METHODS,
  formatHttpMethod,
  createOperationKey,
  getParameterKey,
} from "../../src/core";

/* -------------------------------------------------------------------------- */
/* Guard functions (isRecord, isReferenceLike, isSchemaRecord)              */
/* -------------------------------------------------------------------------- */

describe("isRecord", () => {
  it("returns true for a plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns true for an empty object", () => {
    expect(isRecord({})).toBe(true);
  });

  it("returns false for an array", () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isRecord("hello")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isRecord(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isRecord(true)).toBe(false);
  });
});

describe("isReferenceLike", () => {
  it("returns true for an object with a non-empty $ref string", () => {
    expect(isReferenceLike({ $ref: "#/components/schemas/User" })).toBe(true);
  });

  it("returns false when $ref is an empty string", () => {
    expect(isReferenceLike({ $ref: "" })).toBe(false);
  });

  it("returns false when $ref is missing", () => {
    expect(isReferenceLike({ description: "nope" })).toBe(false);
  });

  it("returns false when $ref is not a string", () => {
    expect(isReferenceLike({ $ref: 123 })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isReferenceLike(null)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isReferenceLike([{ $ref: "#/x" }])).toBe(false);
  });
});

describe("isSchemaRecord", () => {
  it("returns true for a plain schema object", () => {
    expect(isSchemaRecord({ type: "string" })).toBe(true);
  });

  it("returns false for a $ref object", () => {
    expect(isSchemaRecord({ $ref: "#/components/schemas/User" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSchemaRecord(null)).toBe(false);
  });

  it("returns false for a boolean (boolean schema)", () => {
    expect(isSchemaRecord(true)).toBe(false);
    expect(isSchemaRecord(false)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTP method constants and helpers                                          */
/* -------------------------------------------------------------------------- */

describe("HTTP_METHODS", () => {
  it("contains all 8 supported HTTP methods", () => {
    expect(HTTP_METHODS).toEqual([
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
      "trace",
    ]);
  });
});

describe("formatHttpMethod", () => {
  it("uppercases the method", () => {
    expect(formatHttpMethod("get")).toBe("GET");
    expect(formatHttpMethod("post")).toBe("POST");
  });
});

describe("createOperationKey", () => {
  it("lowercases the method and joins with colon", () => {
    expect(createOperationKey("GET", "/users")).toBe("get:/users");
  });

  it("handles already-lowercase method", () => {
    expect(createOperationKey("post", "/users/{id}")).toBe(
      "post:/users/{id}",
    );
  });
});

describe("getParameterKey", () => {
  it("combines in and name", () => {
    expect(getParameterKey({ name: "id", in: "path" } as any)).toBe("path:id");
  });
});
