import {
  upgradeOasTo32,
  type Oas32Document,
  type OpenApiInput,
  type OpenApiUpgradeError,
  type UpgradeOptions,
} from "@powerduck/openapi-parser";

import { buildDocTree, type TreeNode } from "@powerduck/tree";

import { buildNavigationGroups, parseOperations } from "./operations";

import type { OasNavigationGroup, OasOperation } from "./types";

/* -------------------------------------------------------------------------- */
/* Options & Result Types                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Options accepted by {@link loadOasDocument}.
 */
export interface LoadOasDocumentOptions {
  /**
   * Validate and upgrade the input to OpenAPI 3.2 via
   * {@link upgradeOasTo32}. Defaults to `true`.
   *
   * When `false`, the input is cast to an OAS 3.2 document directly with no
   * validation or upgrade step.
   */
  autoUpgrade?: boolean;

  /**
   * Options forwarded to {@link upgradeOasTo32}. Only used when
   * `autoUpgrade` is `true`.
   */
  validateOptions?: UpgradeOptions;
}

/**
 * Result returned by {@link loadOasDocument}.
 *
 * The loader never throws: failures are reported through the `error` field
 * and the collection fields are returned as empty arrays.
 */
export interface LoadOasDocumentResult {
  /**
   * The validated OpenAPI 3.2 document, or `null` when loading failed.
   */
  document: Oas32Document | null;

  /**
   * The upgrade/validation error, or `null` when loading succeeded.
   */
  error: OpenApiUpgradeError | Error | null;

  /**
   * All normalized operations extracted from the document.
   */
  operations: OasOperation[];

  /**
   * Tag-based navigation groups built from the operations.
   */
  navigationGroups: OasNavigationGroup[];

  /**
   * Top-level children of the built documentation tree root.
   */
  tree: TreeNode[];

  /**
   * Warnings emitted while building the documentation tree.
   */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Loads an OpenAPI document, upgrades it to OAS 3.2 when requested, and
 * produces the parsed operations, navigation groups and documentation tree.
 *
 * This function never throws: any failure (upgrade, validation, or tree
 * building) is captured on the returned result object.
 */
export async function loadOasDocument(
  input: OpenApiInput,
  options: LoadOasDocumentOptions = {},
): Promise<LoadOasDocumentResult> {
  const { autoUpgrade = true, validateOptions } = options;

  let document: Oas32Document | null = null;
  let error: OpenApiUpgradeError | Error | null = null;
  let warnings: string[] = [];

  /* ---------------------------------------------------------------------- */
  /* Resolve the document to an OAS 3.2 shape                                */
  /* ---------------------------------------------------------------------- */

  if (autoUpgrade) {
    try {
      document = await upgradeOasTo32(input, validateOptions);
    } catch (err) {
      document = null;
      error = err instanceof Error ? err : new Error(String(err));
    }
  } else {
    /*
     * Skip validation and upgrade. Callers are responsible for passing a
     * document that is already compatible with OAS 3.2.
     */
    document = input as unknown as Oas32Document;
  }

  /* ---------------------------------------------------------------------- */
  /* Early return when the document is unavailable                           */
  /* ---------------------------------------------------------------------- */

  if (!document) {
    return {
      document: null,
      error,
      operations: [],
      navigationGroups: [],
      tree: [],
      warnings: [],
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Derive operations, navigation and tree                                  */
  /* ---------------------------------------------------------------------- */

  const operations = parseOperations(document);

  const navigationGroups = buildNavigationGroups(document, operations);

  let tree: TreeNode[] = [];

  try {
    const result = buildDocTree(document);
    warnings = result.warnings;
    tree = result.root.children ?? [];
  } catch {
    /*
     * Tree building failures must not fail the whole load. Keep the parsed
     * operations and navigation, and expose an empty tree.
     */
    tree = [];
  }

  return {
    document,
    error,
    operations,
    navigationGroups,
    tree,
    warnings,
  };
}
