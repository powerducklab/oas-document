import { describe, it, expect } from "vitest";

import {
  parseOperations,
  flattenOperations,
  findOperationById,
  findOperation,
  buildNavigationGroups,
} from "../../src/core";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const baseDoc: any = {
  openapi: "3.2.0",
  info: { title: "Test API", version: "1.0.0" },
  tags: [
    { name: "users", description: "User management" },
    { name: "admin", description: "Admin operations" },
  ],
  paths: {
    "/users": {
      parameters: [
        { name: "x-api-version", in: "header", schema: { type: "string" } },
      ],
      get: {
        summary: "List users",
        operationId: "listUsers",
        tags: ["users"],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createUser",
        tags: ["users"],
        requestBody: { $ref: "#/components/requestBodies/UserBody" },
        responses: { "201": { description: "Created" } },
      },
    },
    "/users/{id}": {
      get: {
        summary: "Get user",
        operationId: "getUser",
        tags: ["users"],
        deprecated: true,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/health": {
      get: {
        // no summary, no operationId
        tags: ["admin"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/untagged": {
      post: {
        summary: "Untagged operation",
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    requestBodies: {
      UserBody: {
        description: "User payload",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* parseOperations                                                             */
/* -------------------------------------------------------------------------- */

describe("parseOperations", () => {
  it("extracts all supported operations", () => {
    const ops = parseOperations(baseDoc);
    expect(ops.length).toBe(5);
  });

  it("returns an empty array when paths is absent", () => {
    expect(parseOperations({ info: { title: "x", version: "1" } } as any)).toEqual([]);
  });

  it("returns an empty array for null document", () => {
    expect(parseOperations(null as any)).toEqual([]);
  });

  it("sets the correct id from operationId", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.id).toBe("listUsers");
  });

  it("falls back to method:path when operationId is absent", () => {
    const ops = parseOperations(baseDoc);
    const health = ops.find((o) => o.path === "/admin/health")!;
    expect(health.id).toBe("get:/admin/health");
  });

  it("falls back to 'METHOD path' when summary is absent", () => {
    const ops = parseOperations(baseDoc);
    const health = ops.find((o) => o.path === "/admin/health")!;
    expect(health.summary).toBe("GET /admin/health");
  });

  it("extracts the method", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.method).toBe("get");
  });

  it("extracts tags", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.tags).toEqual(["users"]);
  });

  it("returns empty tags when none are defined", () => {
    const ops = parseOperations(baseDoc);
    const untagged = ops.find((o) => o.path === "/untagged")!;
    expect(untagged.tags).toEqual([]);
  });

  it("marks deprecated operations", () => {
    const ops = parseOperations(baseDoc);
    const getUser = ops.find((o) => o.operationId === "getUser")!;
    expect(getUser.deprecated).toBe(true);
  });

  it("marks non-deprecated operations as not deprecated", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.deprecated).toBe(false);
  });

  it("merges path-level and operation-level parameters", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    const paramNames = listUsers.parameters.map((p: any) => p.name);
    expect(paramNames).toContain("x-api-version");
  });

  it("includes operation-level path parameters", () => {
    const ops = parseOperations(baseDoc);
    const getUser = ops.find((o) => o.operationId === "getUser")!;
    const paramNames = getUser.parameters.map((p: any) => p.name);
    expect(paramNames).toContain("id");
  });

  it("resolves requestBody $ref", () => {
    const ops = parseOperations(baseDoc);
    const createUser = ops.find((o) => o.operationId === "createUser")!;
    expect(createUser.requestBody).toBeDefined();
    expect(createUser.requestBody).toHaveProperty("description", "User payload");
  });

  it("includes responses as a record", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.responses).toHaveProperty("200");
  });

  it("stores the raw operation", () => {
    const ops = parseOperations(baseDoc);
    const listUsers = ops.find((o) => o.operationId === "listUsers")!;
    expect(listUsers.raw).toHaveProperty("summary", "List users");
  });
});

describe("flattenOperations", () => {
  it("is an alias for parseOperations", () => {
    expect(flattenOperations(baseDoc)).toEqual(parseOperations(baseDoc));
  });
});

/* -------------------------------------------------------------------------- */
/* findOperationById                                                          */
/* -------------------------------------------------------------------------- */

describe("findOperationById", () => {
  const ops = parseOperations(baseDoc);

  it("finds an operation by operationId", () => {
    const result = findOperationById(ops, "listUsers");
    expect(result).toBeDefined();
    expect(result?.operationId).toBe("listUsers");
  });

  it("finds an operation by id (method:path) when no operationId", () => {
    const result = findOperationById(ops, "get:/admin/health");
    expect(result).toBeDefined();
    expect(result?.path).toBe("/admin/health");
  });

  it("returns the first operation when no id is provided", () => {
    const result = findOperationById(ops);
    expect(result).toBeDefined();
    expect(result).toBe(ops[0]);
  });

  it("returns undefined for an empty operations array", () => {
    expect(findOperationById([], "listUsers")).toBeUndefined();
  });

  it("returns undefined when no match is found", () => {
    expect(findOperationById(ops, "nonExistentOp")).toBeUndefined();
  });
});

describe("findOperation", () => {
  it("is an alias for findOperationById", () => {
    const ops = parseOperations(baseDoc);
    expect(findOperation(ops, "listUsers")).toEqual(
      findOperationById(ops, "listUsers"),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* buildNavigationGroups                                                       */
/* -------------------------------------------------------------------------- */

describe("buildNavigationGroups", () => {
  const ops = parseOperations(baseDoc);

  it("groups operations by their tags", () => {
    const groups = buildNavigationGroups(baseDoc, ops);
    const userGroup = groups.find((g) => g.label === "users");
    expect(userGroup).toBeDefined();
    expect(userGroup?.operations.length).toBeGreaterThan(0);
  });

  it("places untagged operations in the 'Other' group", () => {
    const groups = buildNavigationGroups(baseDoc, ops);
    const otherGroup = groups.find((g) => g.label === "Other");
    expect(otherGroup).toBeDefined();
    const paths = otherGroup!.operations.map((o) => o.path);
    expect(paths).toContain("/untagged");
  });

  it("places 'Other' group last in sort order", () => {
    const groups = buildNavigationGroups(baseDoc, ops);
    expect(groups[groups.length - 1].label).toBe("Other");
  });

  it("attaches tag descriptions from the document", () => {
    const groups = buildNavigationGroups(baseDoc, ops);
    const userGroup = groups.find((g) => g.label === "users");
    expect(userGroup?.description).toBe("User management");
  });

  it("orders groups by tag definition order", () => {
    const groups = buildNavigationGroups(baseDoc, ops);
    const labels = groups.map((g) => g.label).filter((l) => l !== "Other");
    expect(labels.indexOf("users")).toBeLessThan(labels.indexOf("admin"));
  });

  it("returns an empty array for no operations", () => {
    expect(buildNavigationGroups(baseDoc, [])).toEqual([]);
  });
});
