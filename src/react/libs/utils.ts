import { useEffect, useState } from "react";

import type { OasOperation } from "../../core";

import { findOperationById } from "../../core";

import type { TreeNode } from "@powerduck/tree";

/**
 * Minimal structural subset of `DocNodeMetadata` attached to operation nodes
 * by the documentation tree builder. Defined locally to avoid reaching into
 * the tree package's adapter entry point.
 */
export interface DocNodeMetadata {
  method?: string;
  path?: string;
  operationId?: string;
  deprecated?: boolean;
  summary?: string;
  description?: string;
  kind?: string;
  operationCount?: number;
}

/* -------------------------------------------------------------------------- */
/* Class name helper                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Joins truthy class name fragments with a space.
 */
export function cn(
  ...parts: Array<string | undefined | null | false>
): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Copies text to the clipboard with a graceful fallback for older browsers.
 * Resolves to `true` when the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  try {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const succeeded = document.execCommand("copy");

    document.body.removeChild(textarea);

    return succeeded;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Media query                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Tracks a CSS media query on the client only. Returns `fallback` until the
 * component has mounted, so server-rendered markup stays deterministic.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(fallback);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    setMatches(mediaQueryList.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQueryList.addEventListener("change", listener);

    return () => mediaQueryList.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

/* -------------------------------------------------------------------------- */
/* Tree node -> operation mapping                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a clicked documentation tree node to a normalized {@link OasOperation}.
 *
 * The tree node id may differ from the operation id depending on how the tree
 * was built, so this falls back to matching by `operationId` and by
 * method + path when the direct id lookup misses.
 */
export function resolveOperationFromNode(
  operations: OasOperation[],
  node: TreeNode,
): OasOperation | undefined {
  const direct = findOperationById(operations, node.id);

  if (direct) {
    return direct;
  }

  const metadata = node.metadata as DocNodeMetadata | undefined;

  if (!metadata) {
    return undefined;
  }

  return operations.find((operation) => {
    if (metadata.operationId && operation.operationId === metadata.operationId) {
      return true;
    }

    if (
      metadata.method &&
      metadata.path &&
      operation.method === metadata.method &&
      operation.path === metadata.path
    ) {
      return true;
    }

    return false;
  });
}

/* -------------------------------------------------------------------------- */
/* Tree traversal                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Recursively walks a tree and invokes `visit` for every node (depth-first).
 */
export function walkTree(
  nodes: TreeNode[],
  visit: (node: TreeNode, depth: number) => void,
  depth = 0,
): void {
  for (const node of nodes) {
    visit(node, depth);

    if (node.children && node.children.length > 0) {
      walkTree(node.children, visit, depth + 1);
    }
  }
}

/**
 * Builds a lookup from operation id (or operationId) to the tree node that
 * represents it. Used by scroll-spy to call `locateNode` on the tree.
 *
 * The lookup prefers matching by `operationId` (most stable) and falls back
 * to method + path when `operationId` is absent.
 */
export function buildOperationTreeIndex(
  tree: TreeNode[],
  operations: OasOperation[],
): Map<string, string> {
  const index = new Map<string, string>();

  const operationById = new Map<string, OasOperation>();

  for (const operation of operations) {
    operationById.set(operation.id, operation);

    if (operation.operationId) {
      operationById.set(operation.operationId, operation);
    }
  }

  walkTree(tree, (node) => {
    const metadata = node.metadata as DocNodeMetadata | undefined;

    if (metadata?.kind !== "operation") {
      return;
    }

    // Direct id match
    if (operationById.has(node.id)) {
      index.set(operationById.get(node.id)!.id, node.id);
      return;
    }

    // Match by operationId
    if (metadata.operationId && operationById.has(metadata.operationId)) {
      index.set(operationById.get(metadata.operationId)!.id, node.id);
      return;
    }

    // Match by method + path
    if (metadata.method && metadata.path) {
      const match = operations.find(
        (op) => op.method === metadata.method && op.path === metadata.path,
      );

      if (match) {
        index.set(match.id, node.id);
      }
    }
  });

  return index;
}
