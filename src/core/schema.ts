import type {
  HttpMethod,
  OpenApiParameter,
  OpenApiSchema,
  OasSchemaField,
} from "./types";

import {
  getBooleanProperty,
  getObjectProperty,
  getProperty,
  getStringProperty,
  isRecord,
  isSchemaRecord,
} from "./resolver";

/* -------------------------------------------------------------------------- */
/* HTTP Methods                                                               */
/* -------------------------------------------------------------------------- */

export const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
];

/**
 * Converts an HTTP method to uppercase.
 */
export function formatHttpMethod(method: HttpMethod): string {
  return method.toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Generic Helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Creates a stable operation identifier.
 */
export function createOperationKey(method: string, path: string): string {
  return `${method.toLowerCase()}:${path}`;
}

/**
 * Creates a stable parameter identifier.
 */
export function getParameterKey(parameter: OpenApiParameter): string {
  return `${parameter.in}:${parameter.name}`;
}

/**
 * Safely serializes JSON.
 */
export function stringifyJson(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Schema Guards                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Converts an unknown value into a usable schema object.
 */
export function resolveSchema(schema: unknown): OpenApiSchema | undefined {
  if (!isSchemaRecord(schema)) {
    return undefined;
  }

  return schema as OpenApiSchema;
}

/**
 * Returns a schema as a runtime record.
 */
function schemaRecord(
  schema: OpenApiSchema | undefined,
): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined;
  }

  return isRecord(schema) ? schema : undefined;
}

/* -------------------------------------------------------------------------- */
/* Schema Type                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns a human-readable schema type.
 */
export function getSchemaTypeLabel(schema: OpenApiSchema | undefined): string {
  const record = schemaRecord(schema);

  if (!record) {
    return "unknown";
  }

  const type = record.type;

  if (typeof type === "string") {
    if (type === "array") {
      const items = resolveSchema(record.items);

      return items ? `${getSchemaTypeLabel(items)}[]` : "array";
    }

    const format =
      typeof record.format === "string" ? record.format : undefined;

    return format ? `${type} (${format})` : type;
  }

  if (Array.isArray(type)) {
    return (
      type
        .filter((item): item is string => typeof item === "string")
        .join(" | ") || "unknown"
    );
  }

  if (record.properties) {
    return "object";
  }

  if (Array.isArray(record.enum) && record.enum.length > 0) {
    return "enum";
  }

  if (Array.isArray(record.oneOf) && record.oneOf.length > 0) {
    return "oneOf";
  }

  if (Array.isArray(record.anyOf) && record.anyOf.length > 0) {
    return "anyOf";
  }

  if (Array.isArray(record.allOf) && record.allOf.length > 0) {
    return "allOf";
  }

  return "unknown";
}

/**
 * Returns a schema description.
 */
export function getSchemaDescription(
  schema: OpenApiSchema | undefined,
): string | undefined {
  return schema ? getStringProperty(schema, "description") : undefined;
}

/**
 * Returns a schema title.
 */
export function getSchemaTitle(
  schema: OpenApiSchema | undefined,
): string | undefined {
  return schema ? getStringProperty(schema, "title") : undefined;
}

/**
 * Returns a schema example.
 */
export function getSchemaExample(schema: OpenApiSchema | undefined): unknown {
  if (!schema) {
    return undefined;
  }

  const record = schemaRecord(schema);

  if (!record) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(record, "example")) {
    return record.example;
  }

  if (Array.isArray(record.examples)) {
    return record.examples[0];
  }

  if (Object.prototype.hasOwnProperty.call(record, "default")) {
    return record.default;
  }

  if (Object.prototype.hasOwnProperty.call(record, "const")) {
    return record.const;
  }

  if (Array.isArray(record.enum) && record.enum.length > 0) {
    return record.enum[0];
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Schema Constraints                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns common schema validation constraints.
 */
export function getSchemaConstraints(
  schema: OpenApiSchema | undefined,
): string[] {
  const record = schemaRecord(schema);

  if (!record) {
    return [];
  }

  const result: string[] = [];

  const numericProperties = [
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties",
  ];

  for (const property of numericProperties) {
    const value = record[property];

    if (typeof value === "number" || typeof value === "boolean") {
      result.push(`${property}: ${value}`);
    }
  }

  if (typeof record.pattern === "string") {
    result.push(`pattern: ${record.pattern}`);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Schema Fields                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Flattens object schema properties for the documentation UI.
 */
export function getOperationSchemaFields(
  schema: OpenApiSchema | undefined,
): OasSchemaField[] {
  return flattenSchemaFields(schema, 0, "");
}

/**
 * Recursively flattens schema properties.
 */
export function flattenSchemaFields(
  schema: OpenApiSchema | undefined,
  depth = 0,
  parentPath = "",
  visited = new Set<unknown>(),
): OasSchemaField[] {
  if (!schema) {
    return [];
  }

  if (visited.has(schema)) {
    return [];
  }

  visited.add(schema);

  const record = schemaRecord(schema);

  if (!record) {
    return [];
  }

  const properties = record.properties;

  if (!isRecord(properties)) {
    return [];
  }

  const required = new Set(
    Array.isArray(record.required)
      ? record.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );

  const fields: OasSchemaField[] = [];

  for (const [name, property] of Object.entries(properties)) {
    const resolved = resolveSchema(property);

    if (!resolved) {
      continue;
    }

    const path = parentPath ? `${parentPath}.${name}` : name;

    fields.push({
      name,
      schema: resolved,
      required: required.has(name),
      depth,
      path,
    });

    fields.push(
      ...flattenSchemaFields(resolved, depth + 1, path, new Set(visited)),
    );
  }

  return fields;
}

/* -------------------------------------------------------------------------- */
/* Parameter Helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns a parameter example without relying on properties that are not
 * present in the strict ParameterObject type.
 */
export function getParameterExample(parameter: OpenApiParameter): unknown {
  const record = parameter as unknown;

  const directExample = getProperty(record, "example");

  if (directExample !== undefined) {
    return directExample;
  }

  const examples = getObjectProperty(record, "examples");

  if (!examples) {
    return undefined;
  }

  for (const example of Object.values(examples)) {
    if (!isRecord(example)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(example, "value")) {
      return example.value;
    }
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Content Helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns the preferred media type from a content object.
 */
export function getPrimaryMediaType<T>(
  content: Record<string, T> | undefined,
): [string, T] | undefined {
  if (!content) {
    return undefined;
  }

  const entries = Object.entries(content);

  if (entries.length === 0) {
    return undefined;
  }

  return (
    entries.find(([mediaType]) =>
      mediaType.toLowerCase().includes("application/json"),
    ) ?? entries[0]
  );
}

/**
 * Returns a resolved server URL.
 */
export function resolveServerUrl(url: string, variables: unknown): string {
  if (!isRecord(variables)) {
    return url;
  }

  return url.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const variable = variables[name];

    if (!isRecord(variable)) {
      return `{${name}}`;
    }

    return typeof variable.default === "string"
      ? variable.default
      : `{${name}}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Schema Metadata                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns whether a schema is deprecated.
 */
export function isSchemaDeprecated(schema: OpenApiSchema | undefined): boolean {
  return schema ? getBooleanProperty(schema, "deprecated") === true : false;
}

/**
 * Returns schema format.
 */
export function getSchemaFormat(
  schema: OpenApiSchema | undefined,
): string | undefined {
  return schema ? getStringProperty(schema, "format") : undefined;
}

/**
 * Returns schema enum values.
 */
export function getSchemaEnum(schema: OpenApiSchema | undefined): unknown[] {
  const record = schemaRecord(schema);

  return Array.isArray(record?.enum) ? record.enum : [];
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Creates a safe display label for arbitrary values.
 */
export function stringifyDisplayValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const result = stringifyJson(value);

  return result || String(value);
}
