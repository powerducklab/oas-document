import type {
  Oas32Document as Document,
  OperationObject,
  ParameterObject,
  PathItemObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  ServerObject,
  TagObject,
} from "@powerduck/openapi-parser";

/* -------------------------------------------------------------------------- */
/* Canonical OpenAPI Types                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Canonical OpenAPI 3.2 document type.
 */
export type OpenApiDocument = Document;

/**
 * Canonical OpenAPI operation type.
 */
export type OpenApiOperation = OperationObject;

/**
 * Canonical OpenAPI parameter type.
 */
export type OpenApiParameter = ParameterObject;

/**
 * Canonical OpenAPI path item type.
 */
export type OpenApiPathItem = PathItemObject;

/**
 * Canonical OpenAPI request body type.
 */
export type OpenApiRequestBody = RequestBodyObject;

/**
 * Canonical OpenAPI response type.
 */
export type OpenApiResponse = ResponseObject;

/**
 * Canonical OpenAPI schema type.
 */
export type OpenApiSchema = SchemaObject;

/**
 * Canonical OpenAPI server type.
 */
export type OpenApiServer = ServerObject;

/**
 * Canonical OpenAPI tag type.
 */
export type OpenApiTag = TagObject;

/* -------------------------------------------------------------------------- */
/* UI View Models                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Supported HTTP methods rendered by the documentation UI.
 */
export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options"
  | "trace";

/**
 * Normalized operation used by the documentation UI.
 */
export interface OasOperation {
  id: string;

  path: string;

  method: HttpMethod;

  summary: string;

  description?: string;

  operationId?: string;

  deprecated: boolean;

  tags: string[];

  parameters: OpenApiParameter[];

  requestBody?: OpenApiRequestBody;

  responses: Record<string, OpenApiResponse>;

  raw: OpenApiOperation;
}

/**
 * Navigation group generated from OpenAPI tags.
 */
export interface OasNavigationGroup {
  id: string;

  label: string;

  description?: string;

  operations: OasOperation[];
}

/**
 * Flattened schema property used by schema tables.
 */
export interface OasSchemaField {
  name: string;

  schema: OpenApiSchema;

  required: boolean;

  depth: number;

  path: string;
}

/**
 * Generated API request example.
 */
export interface OasRequestExample {
  language: string;

  label: string;

  code: string;
}
