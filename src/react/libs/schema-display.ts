import { resolveSchema, type OpenApiDocument, type OpenApiSchema } from "../../core";
type OasRootDocument = OpenApiDocument;

function resolveJsonPointer(document: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) =>
      decodeURIComponent(segment.replace(/~1/g, "/").replace(/~0/g, "~")),
    );

  let node: unknown = document;

  for (const segment of segments) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(node, segment)) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }

  return node;
}

function mergeSchemaObjects(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const baseProperties = (base.properties as Record<string, unknown>) || {};
  const nextProperties = (next.properties as Record<string, unknown>) || {};

  const baseRequired = Array.isArray(base.required) ? base.required : [];
  const nextRequired = Array.isArray(next.required) ? next.required : [];

  return {
    ...base,
    ...next,
    properties: { ...baseProperties, ...nextProperties },
    required: Array.from(new Set([...baseRequired, ...nextRequired])),
  };
}

export function resolveSchemaRef(
  schema: unknown,
  document: OasRootDocument,
  seen: Set<unknown> = new Set(),
): OpenApiSchema | undefined {
  if (!schema || typeof schema !== "object" || seen.has(schema) || seen.size >= 64) {
    return undefined;
  }

  seen = new Set(seen);
  seen.add(schema);
  const schemaObject = schema as Record<string, unknown>;
  const ref = schemaObject.$ref;

  if (typeof ref === "string") {
    if (seen.has(ref)) {
      return undefined;
    }

    const nextSeen = new Set(seen);
    nextSeen.add(ref);

    const target = resolveSchemaRef(resolveJsonPointer(document, ref), document, nextSeen);
    if (!target || typeof target !== "object") return undefined;
    const { $ref: _ref, ...siblings } = schemaObject;
    return { ...target, ...siblings } as OpenApiSchema;
  }

  const allOf = schemaObject.allOf;

  if (Array.isArray(allOf) && allOf.length > 0) {
    const merged = allOf.reduce<Record<string, unknown>>(
      (accumulator, entry) => {
        const resolvedEntry = resolveSchemaRef(entry, document, seen) as
          | Record<string, unknown>
          | undefined;

        return resolvedEntry
          ? mergeSchemaObjects(accumulator, resolvedEntry)
          : accumulator;
      },
      {},
    );

    const { allOf: _allOf, ...rest } = schemaObject;

    return mergeSchemaObjects(merged, rest) as OpenApiSchema;
  }

  return (resolveSchema(schemaObject as OpenApiSchema) ??
    (schemaObject as OpenApiSchema)) as OpenApiSchema;
}

export type SchemaField = {
  path: string;
  name: string;
  schema: OpenApiSchema;
  required: boolean;
};

export function getDirectFields(
  schema: OpenApiSchema | undefined,
  document: OasRootDocument,
  seen = new Set<unknown>(),
): SchemaField[] {
  if (seen.has(schema) || seen.size >= 64) return [];
  seen.add(schema);
  const resolved = resolveSchemaRef(schema, document) as
    | Record<string, unknown>
    | undefined;

  if (!resolved) {
    return [];
  }

  if (resolved.type === "array" && resolved.items) {
    return getDirectFields(resolved.items as OpenApiSchema, document, seen);
  }

  const properties = resolved.properties as
    | Record<string, OpenApiSchema>
    | undefined;

  if (!properties) {
    return [];
  }

  const requiredList = Array.isArray(resolved.required)
    ? (resolved.required as string[])
    : [];

  return Object.entries(properties).map(([name, propertySchema]) => ({
    path: name,
    name,
    schema: (resolveSchemaRef(propertySchema, document) ??
      propertySchema) as OpenApiSchema,
    required: requiredList.includes(name),
  }));
}

export function buildExampleValue(
  schema: unknown,
  document: OasRootDocument,
  depth = 0,
  budget = { remaining: 1000 },
): unknown {
  if (depth > 6 || budget.remaining-- <= 0) {
    return null;
  }

  const resolved = resolveSchemaRef(schema, document) as
    | Record<string, unknown>
    | undefined;

  if (!resolved) {
    return null;
  }

  if (resolved.example !== undefined) {
    return resolved.example;
  }

  if (resolved.default !== undefined) {
    return resolved.default;
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }

  /* oneOf / anyOf: pick the first alternative for example building. */
  const oneOf = resolved.oneOf as unknown;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return buildExampleValue(oneOf[0], document, depth + 1, budget);
  }

  const anyOf = resolved.anyOf as unknown;
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    return buildExampleValue(anyOf[0], document, depth + 1, budget);
  }

  const type = resolved.type as string | undefined;

  if (type === "array") {
    return [buildExampleValue(resolved.items, document, depth + 1, budget)];
  }

  if (type === "object" || resolved.properties) {
    const properties = (resolved.properties as Record<string, unknown>) || {};

    return Object.fromEntries(
      Object.entries(properties).slice(0, Math.max(0, budget.remaining)).map(([name, propertySchema]) => [
        name,
        buildExampleValue(propertySchema, document, depth + 1, budget),
      ]),
    );
  }

  if (type === "integer" || type === "number") {
    return resolved.format === "int64" ? 1234567890 : 0;
  }

  if (type === "boolean") {
    return true;
  }

  const format = resolved.format as string | undefined;

  if (format === "date-time") {
    return "2026-01-01T00:00:00Z";
  }

  if (format === "date") {
    return "2026-01-01";
  }

  if (format === "email") {
    return "user@example.com";
  }

  if (format === "uuid") {
    return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
  }

  return "string";
}

export function stringifyExample(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

