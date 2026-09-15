import { describe, it, expect } from "vitest";

import { loadOasDocument } from "../../src/core";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const minimalDoc: any = {
  openapi: "3.2.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        summary: "List users",
        operationId: "listUsers",
        tags: ["users"],
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Create user",
        operationId: "createUser",
        tags: ["users"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/users/{id}": {
      get: {
        summary: "Get user",
        operationId: "getUser",
        tags: ["users"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
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
    },
  },
};

/* -------------------------------------------------------------------------- */
/* autoUpgrade = false (direct cast)                                            */
/* -------------------------------------------------------------------------- */

describe("loadOasDocument with autoUpgrade=false", () => {
  it("returns the document as-is without validation", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(result.document).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it("parses operations from the document", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(result.operations.length).toBe(3);
  });

  it("finds operations by operationId", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    const ids = result.operations.map((o) => o.operationId);
    expect(ids).toContain("listUsers");
    expect(ids).toContain("createUser");
    expect(ids).toContain("getUser");
  });

  it("builds navigation groups", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(result.navigationGroups.length).toBeGreaterThan(0);
    const userGroup = result.navigationGroups.find((g) => g.label === "users");
    expect(userGroup).toBeDefined();
  });

  it("returns a tree array", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(Array.isArray(result.tree)).toBe(true);
  });

  it("returns a warnings array", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* autoUpgrade = true (validation + upgrade)                                   */
/* -------------------------------------------------------------------------- */

describe("loadOasDocument with autoUpgrade=true", () => {
  it("successfully upgrades a valid OAS 3.2 document", async () => {
    const result = await loadOasDocument(minimalDoc);
    expect(result.error).toBeNull();
    expect(result.document).not.toBeNull();
  });

  it("parses operations after upgrade", async () => {
    const result = await loadOasDocument(minimalDoc);
    expect(result.operations.length).toBe(3);
  });

  it("never throws on invalid input", async () => {
    const invalid = { openapi: "3.2.0" } as any; // missing required info
    await expect(loadOasDocument(invalid)).resolves.toBeDefined();
  });

  it("returns an error object for invalid input", async () => {
    const invalid = { openapi: "3.2.0" } as any;
    const result = await loadOasDocument(invalid);
    expect(result.error).not.toBeNull();
  });

  it("returns empty collections when loading fails", async () => {
    const invalid = { openapi: "3.2.0" } as any;
    const result = await loadOasDocument(invalid);
    expect(result.document).toBeNull();
    expect(result.operations).toEqual([]);
    expect(result.navigationGroups).toEqual([]);
    expect(result.tree).toEqual([]);
  });

  it("handles completely malformed input gracefully", async () => {
    const result = await loadOasDocument("not a document at all" as any);
    expect(result.error).not.toBeNull();
    expect(result.operations).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Result shape                                                                 */
/* -------------------------------------------------------------------------- */

describe("loadOasDocument result shape", () => {
  it("always returns all six fields", async () => {
    const result = await loadOasDocument(minimalDoc, { autoUpgrade: false });
    expect(result).toHaveProperty("document");
    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("operations");
    expect(result).toHaveProperty("navigationGroups");
    expect(result).toHaveProperty("tree");
    expect(result).toHaveProperty("warnings");
  });
});
