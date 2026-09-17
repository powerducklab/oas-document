import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  OasNavigationGroup,
  OasOperation,
} from "../../core";

import { findOperationById, loadOasDocument } from "../../core";

import type { OpenApiInput } from "@powerduck/openapi-parser";
import type { Oas32Document } from "@powerduck/openapi-parser";

import type { TreeNode } from "@powerduck/tree";

/* -------------------------------------------------------------------------- */
/* Options & result types                                                      */
/* -------------------------------------------------------------------------- */

export interface UseOasDocumentOptions {
  /** Upgrade the input to OpenAPI 3.2. Defaults to `true`. */
  autoUpgrade?: boolean;

  /** Operation id (or operationId) selected on first load. */
  defaultOperationId?: string;

  /** Initial color theme. Defaults to `"light"`. */
  initialTheme?: "light" | "dark";
  /** Controlled theme supplied by an embedding application. */
  theme?: "light" | "dark";
}

export interface UseOasDocumentResult {
  /** The parsed OpenAPI 3.2 document, or null while loading / on error. */
  document: Oas32Document | null;

  /** True while the document is being loaded / upgraded. */
  loading: boolean;

  /** The load / upgrade error, or null. */
  error: Error | null;

  /** All normalized operations. */
  operations: OasOperation[];

  /** Tag-based navigation groups. */
  navigationGroups: OasNavigationGroup[];

  /** Root children of the documentation tree. */
  tree: TreeNode[];

  /** Warnings emitted while building the documentation tree. */
  warnings: string[];

  /** The currently selected operation. */
  selectedOperation: OasOperation | undefined;

  /** Select an operation by id (or operationId). Pass undefined to clear. */
  setSelectedOperation: (operationId: string | undefined) => void;

  /** Current color theme. */
  theme: "light" | "dark";

  /** Set the color theme. */
  setTheme: (theme: "light" | "dark") => void;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Loads an OpenAPI document through the core loader and exposes the parsed
 * operations, navigation groups, documentation tree and selection state.
 *
 * Re-runs whenever `input` or `autoUpgrade` changes. The loader never throws;
 * failures are surfaced through the `error` field.
 */
export function useOasDocument(
  input: OpenApiInput | Oas32Document | null | undefined,
  options: UseOasDocumentOptions = {},
): UseOasDocumentResult {
  const { autoUpgrade = true, defaultOperationId, initialTheme = "light" } =
    options;

  const [document, setDocument] = useState<Oas32Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [operations, setOperations] = useState<OasOperation[]>([]);
  const [navigationGroups, setNavigationGroups] = useState<OasNavigationGroup[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<
    string | undefined
  >(defaultOperationId);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const stored = window.localStorage.getItem("pde-oas-theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch { /* localStorage unavailable */ }
    return initialTheme;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("pde-oas-theme", theme);
    } catch { /* localStorage unavailable */ }
  }, [theme]);

  /* ---- Load / upgrade the document -------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setDocument(null);
    setOperations([]);
    setNavigationGroups([]);
    setTree([]);
    setWarnings([]);

    if (input === null || input === undefined) {
      setDocument(null);
      setError(null);
      setOperations([]);
      setNavigationGroups([]);
      setTree([]);
      setWarnings([]);
      setLoading(false);
      return;
    }

    loadOasDocument(input as OpenApiInput, { autoUpgrade })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setDocument(result.document);
        setError(result.error);
        setOperations(result.operations);
        setNavigationGroups(result.navigationGroups);
        setTree(result.tree);
        setWarnings(result.warnings);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [input, autoUpgrade]);

  /* ---- Keep the selection valid once operations are available ------------ */
  useEffect(() => {
    if (operations.length === 0) {
      return;
    }

    if (findOperationById(operations, selectedOperationId)) {
      return;
    }

    setSelectedOperationId(
      findOperationById(operations, defaultOperationId)?.id ??
        operations[0]?.id,
    );
  }, [operations, selectedOperationId, defaultOperationId]);

  const selectedOperation = useMemo(
    () => findOperationById(operations, selectedOperationId),
    [operations, selectedOperationId],
  );

  const setSelectedOperation = useCallback((next: string | undefined) => {
    setSelectedOperationId(next);
  }, []);

  return {
    document,
    loading,
    error,
    operations,
    navigationGroups,
    tree,
    warnings,
    selectedOperation,
    setSelectedOperation,
    theme: options.theme ?? theme,
    setTheme,
  };
}
