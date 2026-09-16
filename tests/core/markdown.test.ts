import { describe, expect, it } from "vitest";
import { buildOperationMarkdown, parseOperations, type OpenApiDocument } from "../../src/core";

function fixture() {
  return {
    openapi: "3.2.0", info: { title: "Example", version: "1" },
    servers: [{ url: "https://root.example.com" }], security: [{ token: [] }],
    paths: { "/pets": {
      servers: [{ url: "https://path.example.com" }],
      parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 50 } }],
      get: { responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } } },
    } },
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer" } },
      schemas: {
        Pet: { type: "object", properties: { parent: { $ref: "#/components/schemas/Pet" }, name: { type: "string", enum: ["Spot"] } } },
        Unused: { type: "string" },
      },
    },
  } as OpenApiDocument;
}
function exportDoc(doc = fixture()) { return buildOperationMarkdown(doc, parseOperations(doc)[0], "https://selected.example.com"); }

describe("operation Markdown", () => {
  it("exports a concise runnable request and a response structure without the document appendix", () => {
    const markdown = exportDoc();
    expect(markdown).toContain("## Request");
    expect(markdown).toContain("curl ");
    expect(markdown).toContain("https://selected.example.com");
    expect(markdown).toContain("## Response (200)");
    expect(markdown).toContain('"Spot"');
    expect(markdown).not.toContain("## Referenced definitions");
    expect(markdown).not.toContain('"openapi"');
    expect(markdown).not.toContain("Unused");
    expect(markdown).not.toContain("Requires curl");
    expect(markdown).toBe(exportDoc());
  });
  it("uses operation servers when no UI server is selected", () => {
    const doc = fixture();
    Object.assign(doc.paths!["/pets"]!.get!, { servers: [{ url: "https://operation.example.com" }] });
    expect(buildOperationMarkdown(doc, parseOperations(doc)[0])).toContain("https://operation.example.com");
  });
  it("prefers an explicit response example over a schema", () => {
    const doc = fixture();
    const response = doc.paths!["/pets"]!.get!.responses!["200"] as any;
    response.content["application/json"].example = { name: "Actual pet" };
    const markdown = exportDoc(doc);
    expect(markdown).toContain('"name": "Actual pet"');
    expect(markdown).not.toContain("Response structure:");
    expect(markdown).not.toContain('"properties"');
  });
  it("resolves named examples, including false and null values", () => {
    const doc = fixture();
    const response = doc.paths!["/pets"]!.get!.responses!["200"] as any;
    response.content["application/json"].examples = { first: { $ref: "#/components/examples/result" } };
    Object.assign(doc.components!, { examples: { result: { value: false } } });
    expect(exportDoc(doc)).toContain("```json\nfalse\n```");
    Object.assign(doc.components!, { examples: { result: { value: null } } });
    expect(exportDoc(doc)).toContain("```json\nnull\n```");
  });
  it("uses schema examples and keeps other response statuses brief", () => {
    const doc = fixture();
    Object.assign(doc.components!.schemas!.Pet!, { examples: [{ name: "Schema example" }] });
    doc.paths!["/pets"]!.get!.responses!["400"] = { description: "Invalid input" };
    const markdown = exportDoc(doc);
    expect(markdown).toContain("Schema example");
    expect(markdown).toContain("Other responses: 400 — Invalid input");
    expect(markdown).not.toContain("## Response (400)");
  });
  it("preserves descriptions and marks an empty response", () => {
    const doc = fixture();
    Object.assign(doc.paths!["/pets"]!.get!, { description: "Use **metadata** to attach values.", responses: { "204": { description: "Deleted" } } });
    expect(exportDoc(doc)).toContain("Use **metadata** to attach values.");
    expect(exportDoc(doc)).toContain("No response body.");
  });
  it("generates the selected client language", () => {
    const doc = fixture();
    const markdown = buildOperationMarkdown(doc, parseOperations(doc)[0], undefined, { language: "javascript", client: "fetch" });
    expect(markdown).toContain("```javascript");
    expect(markdown).toContain("fetch(");
  });
});
