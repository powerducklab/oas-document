import {
  upgradeOasTo32,
  type Oas32Document,
  type OpenApiInput,
  type OpenApiUpgradeError,
  type UpgradeOptions,
} from "@powerduck/openapi-parser";

import { buildDocTree, type TreeNode } from "@powerduck/tree";

import { isRecord } from "./resolver";

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
   * When `false`, the input must be a document object. Only its basic shape is
   * checked; full schema validation and upgrading are skipped.
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
  try {
    const { autoUpgrade = true, validateOptions } = options;
    let document: Oas32Document;
    if (autoUpgrade) {
      document = await upgradeOasTo32(input, validateOptions);
    } else {
      if (!isRecord(input) || typeof (input as Record<string, unknown>).openapi !== "string" || !isRecord(input.info)) {
        throw new TypeError("Without autoUpgrade, input must be an OpenAPI document object with info and openapi fields.");
      }
      document = input as Oas32Document;
    }
    const operations = parseOperations(document);
    const navigationGroups = buildNavigationGroups(document, operations);
    let tree: TreeNode[] = [];
    let warnings: string[] = [];
    try {
      const result = buildDocTree(document);
      warnings = result.warnings;
      tree = result.root.children ?? [];
    } catch (cause) {
      // Preserve usable operations even when navigation cannot be built.
      warnings.push(`Navigation is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return { document, error: null, operations, navigationGroups, tree, warnings };
  } catch (cause) {
    return {
      document: null,
      error: cause instanceof Error ? cause : new Error(String(cause)),
      operations: [], navigationGroups: [], tree: [], warnings: [],
    };
  }
}
