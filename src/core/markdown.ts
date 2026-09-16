import { generate, registerBuiltins } from "@powerduck/openapi-codegen";
import type { OasOperation, OpenApiDocument } from "./types";
import { getProperty, resolveReference } from "./resolver";
import { getPrimaryMediaType, resolveServerUrl } from "./schema";

export interface OperationMarkdownOptions {
  language?: string;
  client?: string;
}

function codeBlock(text: string, language: string): string {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  const fence = "`".repeat(length);
  return `${fence}${language.replace(/[^a-zA-Z0-9_-]/g, "")}\n${text}\n${fence}`;
}

/** Expand only the displayed response schema, keeping recursive references intact. */
function responseStructure(document: OpenApiDocument, value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (!value || typeof value !== "object") return value;
  if (ancestors.has(value) || depth > 20) return { description: "Recursive or deeply nested structure; see the API schema." };
  const next = new Set(ancestors).add(value);
  const reference = getProperty(value, "$ref");
  if (typeof reference === "string") {
    const resolved = resolveReference<object>(document, value);
    if (!resolved || next.has(resolved)) return value;
    const { $ref: _, ...siblings } = value as Record<string, unknown>;
    return responseStructure(document, { ...resolved, ...siblings }, new Set(next).add(resolved), depth + 1);
  }
  if (Array.isArray(value)) return value.map((item) => responseStructure(document, item, next, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, responseStructure(document, child, next, depth + 1)]));
}

/** Concise documentation: description, selected client request, and one primary response. */
export function buildOperationMarkdown(document: OpenApiDocument, operation: OasOperation, selectedServer?: string, options: OperationMarkdownOptions = {}): string {
  const language = options.language ?? "shell";
  const client = options.client ?? "curl";
  const pathItem = resolveReference(document, document.paths?.[operation.path]);
  const servers = operation.raw.servers ?? getProperty(pathItem, "servers") ?? document.servers;
  const server = Array.isArray(servers) ? servers[0] : undefined;
  const serverUrl = selectedServer || (typeof server?.url === "string" ? resolveServerUrl(server.url, server.variables) : undefined);
  registerBuiltins();
  const request = generate({ document, path: operation.path, method: operation.method, language, client, ...(serverUrl ? { serverUrl } : {}) });
  // Drop generator installation notes, keeping the actual runnable request intact.
  const requestCode = language === "shell" ? request.replace(/^(?:#[^\n]*\n|\s*\n)+/, "").trim() : request.trim();
  const sections = [
    `# ${(operation.summary || operation.operationId || operation.path).replace(/[\r\n]/g, " ")}`,
    `${operation.method.toUpperCase()} ${operation.path}`,
  ];
  if (operation.description) sections.push(operation.description);
  if (operation.deprecated) sections.push("**Deprecated.**");
  sections.push("## Request", codeBlock(requestCode, language === "shell" ? "bash" : language));

  const responses = Object.entries(operation.responses).sort(([a], [b]) => {
    const rank = (status: string) => /^2\d\d$/.test(status) ? 0 : /^2XX$/i.test(status) ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const primary = responses[0];
  if (primary) {
    const [status, response] = primary;
    sections.push(`## Response (${status})`);
    if (response.description) sections.push(response.description);
    const media = getPrimaryMediaType(response.content)?.[1];
    let example = getProperty(media, "example");
    if (example === undefined) {
      const examples = getProperty(media, "examples");
      if (examples && typeof examples === "object") {
        for (const entry of Object.values(examples)) {
          example = getProperty(resolveReference(document, entry), "value");
          if (example !== undefined) break;
        }
      }
    }
    const schema = getProperty(media, "schema");
    if (example === undefined) {
      const resolved = resolveReference(document, schema);
      example = getProperty(resolved, "example");
      const examples = getProperty(resolved, "examples");
      if (example === undefined && Array.isArray(examples)) example = examples[0];
    }
    if (example !== undefined) {
      sections.push(codeBlock(JSON.stringify(example, null, 2), "json"));
    } else if (schema !== undefined) {
      sections.push("Response structure:", codeBlock(JSON.stringify(responseStructure(document, schema), null, 2), "json"));
    } else {
      sections.push(response.content ? "No response example or schema is documented." : "No response body.");
    }
    if (responses.length > 1) sections.push("Other responses: " + responses.slice(1).map(([code, item]) => `${code}${item.description ? ` — ${item.description.replace(/\s+/g, " ")}` : ""}`).join("; ") + ".");
  }
  return `${sections.join("\n\n")}\n`;
}
