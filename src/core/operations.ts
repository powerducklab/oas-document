import type {
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiRequestBody,
  OpenApiResponse,
  OasNavigationGroup,
  OasOperation,
} from "./types";

import { createOperationKey, getParameterKey, HTTP_METHODS } from "./schema";

import {
  getArrayProperty,
  getObjectProperty,
  getProperty,
  getStringProperty,
  isRecord,
  resolveReference,
} from "./resolver";

/* -------------------------------------------------------------------------- */
/* Internal Types                                                             */
/* -------------------------------------------------------------------------- */

type ResponsesMap = Record<string, OpenApiResponse>;

/* -------------------------------------------------------------------------- */
/* Operation Parsing                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Extracts all supported HTTP operations from an OpenAPI document.
 */
export function parseOperations(document: OpenApiDocument): OasOperation[] {
  const paths = getObjectProperty(document, "paths");

  if (!paths) {
    return [];
  }

  const operations: OasOperation[] = [];

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = resolveReference<OpenApiPathItem>(document, rawPathItem);

    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const rawOperation = getProperty(pathItem, method);

      if (rawOperation === undefined || rawOperation === null) {
        continue;
      }

      const operation = resolveReference<OpenApiOperation>(
        document,
        rawOperation,
      );

      if (!operation || !isRecord(operation)) {
        continue;
      }

      const parameters = mergeParameters(
        document,
        getProperty(pathItem, "parameters"),
        getProperty(operation, "parameters"),
      );

      const responses = normalizeResponses(
        document,
        getProperty(operation, "responses"),
      );

      const operationId = getStringProperty(operation, "operationId");

      const summary =
        getStringProperty(operation, "summary") ||
        operationId ||
        `${method.toUpperCase()} ${path}`;

      const description = getStringProperty(operation, "description");

      const tags =
        getArrayProperty(operation, "tags")?.filter(
          (tag): tag is string => typeof tag === "string",
        ) ?? [];

      const requestBodyValue = getProperty(operation, "requestBody");

      const requestBody =
        requestBodyValue !== undefined
          ? resolveReference<OpenApiRequestBody>(document, requestBodyValue)
          : undefined;

      const id = operationId || createOperationKey(method, path);

      operations.push({
        id,
        path,
        method,
        summary,
        description,
        operationId,
        deprecated: getProperty(operation, "deprecated") === true,
        tags,
        parameters,
        requestBody,
        responses,
        raw: operation,
      });
    }
  }

  return operations;
}

/**
 * Alias used by the documentation component.
 */
export function flattenOperations(document: OpenApiDocument): OasOperation[] {
  return parseOperations(document);
}

/* -------------------------------------------------------------------------- */
/* Parameters                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Merges path-level and operation-level parameters.
 *
 * Operation-level parameters override path-level parameters with the same
 * name and location.
 */
function mergeParameters(
  document: OpenApiDocument,
  pathParameters: unknown,
  operationParameters: unknown,
): OpenApiParameter[] {
  const result = new Map<string, OpenApiParameter>();

  const register = (value: unknown): void => {
    const parameter = resolveReference<OpenApiParameter>(document, value);

    if (!parameter || !isRecord(parameter)) {
      return;
    }

    const name = getStringProperty(parameter, "name");

    const location = getStringProperty(parameter, "in");

    if (!name || !location) {
      return;
    }

    result.set(getParameterKey(parameter), parameter);
  };

  if (Array.isArray(pathParameters)) {
    for (const parameter of pathParameters) {
      register(parameter);
    }
  }

  if (Array.isArray(operationParameters)) {
    for (const parameter of operationParameters) {
      register(parameter);
    }
  }

  return [...result.values()];
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes the ResponsesObject into the UI response model.
 */
function normalizeResponses(
  document: OpenApiDocument,
  value: unknown,
): ResponsesMap {
  if (!isRecord(value)) {
    return {};
  }

  const result: ResponsesMap = {};

  for (const [status, responseValue] of Object.entries(value)) {
    const response = resolveReference<OpenApiResponse>(document, responseValue);

    if (!response || !isRecord(response)) {
      continue;
    }

    result[status] = response;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Finds an operation by identifier.
 */
export function findOperationById(
  operations: OasOperation[],
  operationId?: string,
): OasOperation | undefined {
  if (!operations.length) {
    return undefined;
  }

  if (!operationId) {
    return operations[0];
  }

  return operations.find(
    (operation) =>
      operation.id === operationId || operation.operationId === operationId,
  );
}

/**
 * Backward-compatible lookup alias.
 */
export function findOperation(
  operations: OasOperation[],
  operationId?: string,
): OasOperation | undefined {
  return findOperationById(operations, operationId);
}

/* -------------------------------------------------------------------------- */
/* Navigation Groups                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Builds tag-based navigation groups.
 *
 * Untagged operations are placed into the "Other" group.
 */
export function buildNavigationGroups(
  document: OpenApiDocument,
  operations: OasOperation[],
): OasNavigationGroup[] {
  const tagDefinitions = getArrayProperty(document, "tags");

  const tagMap = new Map<
    string,
    {
      description?: string;
      order: number;
    }
  >();

  if (tagDefinitions) {
    for (let index = 0; index < tagDefinitions.length; index += 1) {
      const tag = tagDefinitions[index];

      if (!isRecord(tag)) {
        continue;
      }

      const name = getStringProperty(tag, "name");

      if (!name) {
        continue;
      }

      tagMap.set(name, {
        description: getStringProperty(tag, "description"),
        order: index,
      });
    }
  }

  const grouped = new Map<string, OasOperation[]>();

  for (const operation of operations) {
    const tags = operation.tags.length > 0 ? operation.tags : ["Other"];

    for (const tag of tags) {
      const existing = grouped.get(tag) ?? [];

      existing.push(operation);

      grouped.set(tag, existing);
    }
  }

  const groups: OasNavigationGroup[] = [...grouped.entries()]
    .map(([label, groupOperations]) => ({
      id: label,
      label,
      description: tagMap.get(label)?.description,
      operations: groupOperations,
    }))
    .sort((a, b) => {
      if (a.label === "Other") {
        return 1;
      }

      if (b.label === "Other") {
        return -1;
      }

      const aOrder = tagMap.get(a.label)?.order ?? Number.MAX_SAFE_INTEGER;

      const bOrder = tagMap.get(b.label)?.order ?? Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return a.label.localeCompare(b.label);
    });

  return groups;
}
