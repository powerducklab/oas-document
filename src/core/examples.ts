import type { OpenApiDocument, OasOperation, OasRequestExample } from "./types";

import { getPrimaryMediaType, stringifyJson } from "./schema";

import {
  getObjectProperty,
  getProperty,
  getStringProperty,
  isRecord,
  resolveReference,
} from "./resolver";

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds all supported request examples.
 */
export function generateRequestExamples(
  document: OpenApiDocument,
  operation: OasOperation,
  serverUrl: string,
): OasRequestExample[] {
  return [
    {
      language: "curl",
      label: "cURL",
      code: buildCurlExample(operation, serverUrl),
    },
    {
      language: "javascript",
      label: "JavaScript",
      code: buildJavaScriptExample(operation, serverUrl),
    },
    {
      language: "json",
      label: "JSON",
      code: buildOperationExample(operation, serverUrl),
    },
  ];
}

/**
 * Builds a JSON request example.
 */
export function buildOperationExample(
  operation: OasOperation,
  serverUrl: string,
): string {
  const body = buildRequestBodyExample(operation);

  const payload: Record<string, unknown> = {
    method: operation.method.toUpperCase(),
    url: buildRequestUrl(operation, serverUrl),
  };

  if (Object.keys(buildHeaders(operation)).length) {
    payload.headers = buildHeaders(operation);
  }

  if (body !== undefined) {
    payload.body = body;
  }

  return stringifyJson(payload, 2);
}

/**
 * Builds a cURL request.
 */
export function buildCurlExample(
  operation: OasOperation,
  serverUrl: string,
): string {
  const url = buildRequestUrl(operation, serverUrl);

  const lines = [
    `curl --request ${operation.method.toUpperCase()}`,
    `  --url '${url}'`,
  ];

  const headers = buildHeaders(operation);

  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  --header '${name}: ${value}'`);
  }

  const body = buildRequestBodyExample(operation);

  if (body !== undefined) {
    lines.push(`  --data '${escapeSingleQuotes(stringifyJson(body))}'`);
  }

  return lines.join(" \\\n");
}

/**
 * Builds a native Fetch API request.
 */
export function buildJavaScriptExample(
  operation: OasOperation,
  serverUrl: string,
): string {
  const url = buildRequestUrl(operation, serverUrl);

  const headers = buildHeaders(operation);

  const body = buildRequestBodyExample(operation);

  const lines = [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    `  method: ${JSON.stringify(operation.method.toUpperCase())},`,
  ];

  if (Object.keys(headers).length > 0) {
    lines.push(`  headers: ${stringifyJson(headers, 2)},`);
  }

  if (body !== undefined) {
    lines.push(`  body: JSON.stringify(${stringifyJson(body, 2)}),`);
  }

  lines.push(`});`, ``, `const data = await response.json();`);

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* URL                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Builds a request URL using readable parameter placeholders.
 */
function buildRequestUrl(operation: OasOperation, serverUrl: string): string {
  let path = operation.path;

  const queryParameters = operation.parameters.filter(
    (parameter) => parameter.in === "query",
  );

  const query =
    queryParameters.length > 0
      ? `?${queryParameters
          .map(
            (parameter) =>
              `${encodeURIComponent(parameter.name)}={${parameter.name}}`,
          )
          .join("&")}`
      : "";

  return `${serverUrl.replace(/\/$/, "")}${path}${query}`;
}

/* -------------------------------------------------------------------------- */
/* Headers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds request headers.
 */
function buildHeaders(operation: OasOperation): Record<string, string> {
  const headers: Record<string, string> = {};

  const mediaType = getPrimaryMediaType(operation.requestBody?.content);

  if (mediaType) {
    headers["Content-Type"] = mediaType[0];
  }

  return headers;
}

/* -------------------------------------------------------------------------- */
/* Body                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Generates a representative request body.
 */
function buildRequestBodyExample(operation: OasOperation): unknown {
  const mediaType = getPrimaryMediaType(operation.requestBody?.content);

  if (!mediaType) {
    return undefined;
  }

  const mediaTypeObject = mediaType[1] as unknown;

  if (!isRecord(mediaTypeObject)) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(mediaTypeObject, "example")) {
    return mediaTypeObject.example;
  }

  const examples = getObjectProperty(mediaTypeObject, "examples");

  if (examples) {
    for (const example of Object.values(examples)) {
      if (!isRecord(example)) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(example, "value")) {
        return example.value;
      }
    }
  }

  const schema = getProperty(mediaTypeObject, "schema");

  return generateSchemaExample(undefined, schema);
}

/* -------------------------------------------------------------------------- */
/* Schema Example                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Generates a representative schema example.
 */
export function generateSchemaExample(
  document: OpenApiDocument | undefined,
  input: unknown,
  depth = 0,
  visited = new Set<unknown>(),
): unknown {
  if (input === undefined || input === null || depth > 8) {
    return null;
  }

  if (visited.has(input)) {
    return null;
  }

  visited.add(input);

  let schema = input;

  if (document && isRecord(schema) && typeof schema.$ref === "string") {
    schema = resolveReference<unknown>(document, schema) ?? schema;
  }

  if (!isRecord(schema)) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "example")) {
    return schema.example;
  }

  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }

  if (Object.prototype.hasOwnProperty.call(schema, "default")) {
    return schema.default;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return schema.const;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateSchemaExample(
      document,
      schema.oneOf[0],
      depth + 1,
      new Set(visited),
    );
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateSchemaExample(
      document,
      schema.anyOf[0],
      depth + 1,
      new Set(visited),
    );
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const values = schema.allOf.map((item) =>
      generateSchemaExample(document, item, depth + 1, new Set(visited)),
    );

    return mergeExamples(values);
  }

  const type = schema.type;

  if (type === "object" || schema.properties) {
    return generateObjectExample(document, schema, depth, visited);
  }

  if (type === "array") {
    return [
      schema.items
        ? generateSchemaExample(
            document,
            schema.items,
            depth + 1,
            new Set(visited),
          )
        : null,
    ];
  }

  if (type === "integer") {
    return 1;
  }

  if (type === "number") {
    return 1.5;
  }

  if (type === "boolean") {
    return true;
  }

  if (type === "null") {
    return null;
  }

  const format = getStringProperty(schema, "format");

  switch (format) {
    case "date":
      return "2026-01-15";

    case "date-time":
      return "2026-01-15T12:00:00Z";

    case "email":
      return "user@example.com";

    case "uuid":
      return "00000000-0000-4000-8000-000000000000";

    case "uri":
      return "https://example.com";

    default:
      return "string";
  }
}

/**
 * Generates an example object.
 */
function generateObjectExample(
  document: OpenApiDocument | undefined,
  schema: Record<string, unknown>,
  depth: number,
  visited: Set<unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const properties = getObjectProperty(schema, "properties");

  if (!properties) {
    return result;
  }

  for (const [name, property] of Object.entries(properties)) {
    result[name] = generateSchemaExample(
      document,
      property,
      depth + 1,
      new Set(visited),
    );
  }

  return result;
}

/**
 * Merges allOf examples.
 */
function mergeExamples(values: unknown[]): unknown {
  const objects = values.filter((value): value is Record<string, unknown> =>
    isRecord(value),
  );

  if (!objects.length) {
    return values[0] ?? null;
  }

  return Object.assign({}, ...objects);
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Escapes a single quote for shell examples.
 */
function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}
