import type { SchemaObject } from "@powerduck/openapi-parser";

import type {
  OpenApiDocument,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSchema,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Runtime Types                                                              */
/* -------------------------------------------------------------------------- */

export type ReferenceLike = {
  $ref: string;
};

export type RecordLike = Record<string, unknown>;

/**
 * Context used during reference resolution.
 *
 * A context is intentionally small so the resolver can stay independent
 * from the UI layer.
 */
export interface OasResolveContext {
  document: OpenApiDocument;
}

/**
 * Internal resolution state.
 */
interface ResolveState {
  /**
   * References currently being expanded.
   *
   * This protects against recursive references such as:
   *
   *   Node -> Node
   *
   * or:
   *
   *   User -> Address -> User
   */
  resolvingRefs: Set<string>;

  /**
   * Maximum number of nested references that may be followed.
   */
  maxDepth: number;
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Determines whether a value is a plain object.
 */
export function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Determines whether a value is a $ref object.
 */
export function isReferenceLike(value: unknown): value is ReferenceLike {
  return (
    isRecord(value) && typeof value.$ref === "string" && value.$ref.length > 0
  );
}

/**
 * Determines whether a value can be treated as an OpenAPI schema object.
 *
 * Boolean schemas are valid in OpenAPI 3.1/3.2, therefore this helper only
 * identifies object-form schemas.
 */
export function isSchemaRecord(
  value: unknown,
): value is Exclude<SchemaObject, boolean> {
  return isRecord(value) && !isReferenceLike(value);
}

/* -------------------------------------------------------------------------- */
/* JSON Pointer                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a local RFC 6901 JSON pointer.
 *
 * External references are intentionally not resolved here.
 *
 * Supported:
 *
 *   #
 *   #/components/schemas/User
 *   #/components/schemas/My~1Schema
 */
export function resolveJsonPointer(root: unknown, reference: string): unknown {
  if (reference === "#") {
    return root;
  }

  if (!reference.startsWith("#/")) {
    return undefined;
  }

  const segments = reference.slice(2).split("/").map(unescapeJsonPointer);

  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }

    if (!(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

/**
 * Decodes an RFC 6901 JSON pointer segment.
 */
function unescapeJsonPointer(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

/* -------------------------------------------------------------------------- */
/* Reference Classification                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Determines whether a reference is local to this document.
 */
export function isLocalReference(reference: string): boolean {
  return reference === "#" || reference.startsWith("#/");
}

/**
 * Determines whether a reference is external.
 *
 * External resolution is intentionally not performed by this resolver.
 */
export function isExternalReference(reference: string): boolean {
  return !isLocalReference(reference);
}

/* -------------------------------------------------------------------------- */
/* Shallow Reference Resolution                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolves one local reference without recursively resolving nested refs.
 */
export function resolveReference<T>(
  document: OpenApiDocument,
  value: unknown,
): T | undefined {
  if (!isReferenceLike(value)) {
    return value as T;
  }

  if (!isLocalReference(value.$ref)) {
    return undefined;
  }

  const resolved = resolveJsonPointer(document, value.$ref);

  if (resolved === undefined) {
    return undefined;
  }

  return resolved as T;
}

/**
 * Resolves one local reference and falls back to the original value when the
 * target cannot be resolved.
 */
export function resolveReferenceOrOriginal<T>(
  document: OpenApiDocument,
  value: unknown,
): T | undefined {
  if (!isReferenceLike(value)) {
    return value as T;
  }

  return resolveReference<T>(document, value) ?? (value as T);
}

/* -------------------------------------------------------------------------- */
/* Merge Helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Merges a referenced object with sibling properties from the original
 * $ref object.
 *
 * Example:
 *
 *   {
 *     "$ref": "#/components/schemas/User",
 *     "description": "Current user"
 *   }
 *
 * becomes conceptually:
 *
 *   {
 *     ...User,
 *     description: "Current user"
 *   }
 *
 * The original document is never mutated.
 */
function mergeReferenceObject(
  resolved: RecordLike,
  reference: RecordLike,
): RecordLike {
  const siblings: RecordLike = {};

  for (const [key, value] of Object.entries(reference)) {
    if (key === "$ref") {
      continue;
    }

    siblings[key] = value;
  }

  if (Object.keys(siblings).length === 0) {
    return { ...resolved };
  }

  return {
    ...resolved,
    ...siblings,
  };
}

/**
 * Returns a cloned value without mutating the original document.
 */
function cloneValue<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  const result: RecordLike = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = cloneValue(item);
  }

  return result as T;
}

/* -------------------------------------------------------------------------- */
/* Recursive Resolution                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Recursively resolves $refs inside an arbitrary OpenAPI value.
 *
 * Important:
 *
 * This function does NOT blindly resolve recursive references forever.
 *
 * If:
 *
 *   Node.children.items -> Node
 *
 * then the second Node reference is left as a $ref.
 */
function resolveValue(
  document: OpenApiDocument,
  value: unknown,
  state: ResolveState,
  depth: number,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > state.maxDepth) {
    return cloneValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(document, item, state, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  /* ------------------------------------------------------------------------ */
  /* $ref                                                                     */
  /* ------------------------------------------------------------------------ */

  if (isReferenceLike(value)) {
    const reference = value.$ref;

    /*
     * External references are intentionally preserved.
     *
     * This keeps the resolver deterministic and avoids network I/O inside
     * the rendering layer.
     */
    if (!isLocalReference(reference)) {
      return cloneValue(value);
    }

    /*
     * Circular reference detected.
     *
     * Keep the original $ref instead of expanding forever.
     */
    if (state.resolvingRefs.has(reference)) {
      return cloneValue(value);
    }

    const target = resolveJsonPointer(document, reference);

    if (target === undefined) {
      return cloneValue(value);
    }

    state.resolvingRefs.add(reference);

    try {
      const resolvedTarget = resolveValue(document, target, state, depth + 1);

      /*
       * If the referenced target is an object, merge $ref siblings.
       */
      if (isRecord(resolvedTarget)) {
        return mergeReferenceObject(resolvedTarget, value);
      }

      /*
       * Boolean schemas and primitive-like targets.
       */
      return resolvedTarget;
    } finally {
      state.resolvingRefs.delete(reference);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Normal Object                                                             */
  /* ------------------------------------------------------------------------ */

  const result: RecordLike = {};

  for (const [key, child] of Object.entries(value)) {
    result[key] = resolveValue(document, child, state, depth + 1);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Generic Resolver                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Creates a reusable OpenAPI reference resolver.
 */
export function createOasResolveContext(
  document: OpenApiDocument,
  options?: {
    maxDepth?: number;
  },
): OasResolveContext {
  return {
    document,
  };
}

/**
 * Resolves an arbitrary OpenAPI value recursively.
 *
 * This is the main low-level resolver.
 */
export function resolveOasValue<T>(
  context: OasResolveContext,
  value: unknown,
  options?: {
    maxDepth?: number;
  },
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const state: ResolveState = {
    resolvingRefs: new Set<string>(),
    maxDepth: options?.maxDepth ?? 64,
  };

  return resolveValue(context.document, value, state, 0) as T;
}

/* -------------------------------------------------------------------------- */
/* Schema Resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolves an OpenAPI schema including nested $refs.
 */
export function resolveSchemaReference(
  document: OpenApiDocument,
  schema: unknown,
  maxDepth = 64,
): OpenApiSchema | undefined {
  if (schema === undefined || schema === null) {
    return undefined;
  }

  const context = createOasResolveContext(document);

  const resolved = resolveOasValue<unknown>(context, schema, {
    maxDepth,
  });

  if (resolved === undefined) {
    return undefined;
  }

  /*
   * OpenAPI supports boolean schemas.
   *
   * The UI OpenApiSchema type currently aliases SchemaObject, so only
   * object-form schemas are returned here.
   */
  if (!isSchemaRecord(resolved)) {
    return undefined;
  }

  return resolved as OpenApiSchema;
}

/**
 * Alias with a shorter name for UI code.
 */
export function resolveSchema(
  document: OpenApiDocument,
  schema: unknown,
): OpenApiSchema | undefined {
  return resolveSchemaReference(document, schema);
}

/* -------------------------------------------------------------------------- */
/* Parameter Resolution                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a parameter and all nested references.
 */
export function resolveParameter(
  document: OpenApiDocument,
  parameter: unknown,
): OpenApiParameter | undefined {
  const context = createOasResolveContext(document);

  return resolveOasValue<OpenApiParameter>(context, parameter);
}

/* -------------------------------------------------------------------------- */
/* Request Body Resolution                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a request body and all nested references.
 */
export function resolveRequestBody(
  document: OpenApiDocument,
  requestBody: unknown,
): OpenApiRequestBody | undefined {
  const context = createOasResolveContext(document);

  return resolveOasValue<OpenApiRequestBody>(context, requestBody);
}

/* -------------------------------------------------------------------------- */
/* Response Resolution                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a response and all nested references.
 */
export function resolveResponse(
  document: OpenApiDocument,
  response: unknown,
): OpenApiResponse | undefined {
  const context = createOasResolveContext(document);

  return resolveOasValue<OpenApiResponse>(context, response);
}

/* -------------------------------------------------------------------------- */
/* Header / Example Resolution                                                */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a header object.
 */
export function resolveHeader(
  document: OpenApiDocument,
  header: unknown,
): RecordLike | undefined {
  const context = createOasResolveContext(document);

  return resolveOasValue<RecordLike>(context, header);
}

/**
 * Resolves an OpenAPI example object.
 */
export function resolveExample(
  document: OpenApiDocument,
  example: unknown,
): RecordLike | undefined {
  const context = createOasResolveContext(document);

  return resolveOasValue<RecordLike>(context, example);
}

/* -------------------------------------------------------------------------- */
/* Document Helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the document components object.
 */
export function getComponents(
  document: OpenApiDocument,
): RecordLike | undefined {
  return getObjectProperty(document, "components");
}

/**
 * Returns a component collection.
 */
export function getComponentCollection(
  document: OpenApiDocument,
  name: string,
): RecordLike | undefined {
  const components = getComponents(document);

  return components ? getObjectProperty(components, name) : undefined;
}

/**
 * Returns a named component.
 */
export function getComponent(
  document: OpenApiDocument,
  collection: string,
  name: string,
): unknown {
  const components = getComponentCollection(document, collection);

  return components?.[name];
}

/* -------------------------------------------------------------------------- */
/* Generic Property Helpers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reads an unknown property from an object.
 */
export function getProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return value[key];
}

/**
 * Reads a string property.
 */
export function getStringProperty(
  value: unknown,
  key: string,
): string | undefined {
  const property = getProperty(value, key);

  return typeof property === "string" ? property : undefined;
}

/**
 * Reads a boolean property.
 */
export function getBooleanProperty(
  value: unknown,
  key: string,
): boolean | undefined {
  const property = getProperty(value, key);

  return typeof property === "boolean" ? property : undefined;
}

/**
 * Reads an array property.
 */
export function getArrayProperty(
  value: unknown,
  key: string,
): unknown[] | undefined {
  const property = getProperty(value, key);

  return Array.isArray(property) ? property : undefined;
}

/**
 * Reads an object property.
 */
export function getObjectProperty(
  value: unknown,
  key: string,
): RecordLike | undefined {
  const property = getProperty(value, key);

  return isRecord(property) ? property : undefined;
}
