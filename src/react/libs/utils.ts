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

  const previousFocus = document.activeElement;
  const textarea = document.createElement("textarea");
  try {

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const succeeded = document.execCommand("copy");

    return succeeded;
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
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
  const stack = nodes.map((node) => ({ node, depth })).reverse();
  const visited = new Set<TreeNode>();
  while (stack.length) {
    const entry = stack.pop()!;
    if (visited.has(entry.node)) continue;
    visited.add(entry.node);
    visit(entry.node, entry.depth);
    const children = entry.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], depth: entry.depth + 1 });
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
  const resolve = createOperationResolver(operations);
  walkTree(tree, (node) => {
    if ((node.metadata as DocNodeMetadata | undefined)?.kind !== "operation") return;
    const operation = resolve(node);
    if (operation && !index.has(operation.id)) index.set(operation.id, node.id);
  });

  return index;
}

/**
 * Returns the operations ordered exactly as they appear in the documentation
 * tree (depth-first, following tag grouping and in-tag ordering).
 *
 * Operations that are not present in the tree (e.g. when tree building
 * skipped them) are appended at the end in their original document order so
 * nothing is lost. This guarantees the rendered content sections line up
 * 1:1 with the left-hand navigation.
 */
export function buildOrderedOperations(
  tree: TreeNode[],
  operations: OasOperation[],
): OasOperation[] {
  const resolve = createOperationResolver(operations);
  const seen = new Set<string>();
  const ordered: OasOperation[] = [];

  const pushOperation = (operation: OasOperation | undefined): void => {
    if (!operation || seen.has(operation.id)) {
      return;
    }

    seen.add(operation.id);
    ordered.push(operation);
  };

  walkTree(tree, (node) => {
    const metadata = node.metadata as DocNodeMetadata | undefined;

    if (metadata?.kind !== "operation") {
      return;
    }

    pushOperation(resolve(node));
  });

  // Append any operations the tree did not surface, preserving original order.
  for (const operation of operations) {
    if (!seen.has(operation.id)) {
      ordered.push(operation);
    }
  }

  return ordered;
}

/** Builds constant-time node lookups while preserving first-match semantics. */
export function createOperationResolver(operations: OasOperation[]) {
  const ids = new Map<string, OasOperation>();
  const endpoints = new Map<string, OasOperation>();
  for (const operation of operations) {
    for (const id of [operation.id, operation.operationId]) {
      if (id && !ids.has(id)) ids.set(id, operation);
    }
    const endpoint = JSON.stringify([operation.method, operation.path]);
    if (!endpoints.has(endpoint)) endpoints.set(endpoint, operation);
  }
  return (node: TreeNode): OasOperation | undefined => {
    const metadata = node.metadata as DocNodeMetadata | undefined;
    return ids.get(node.id) ??
      (metadata?.operationId ? ids.get(metadata.operationId) : undefined) ??
      endpoints.get(JSON.stringify([metadata?.method, metadata?.path]));
  };
}

/** Restricts configurable navigation links to web and relative URLs. */
export function safeNavigationHref(value: string): string | undefined {
  try {
    const url = new URL(value, "https://oas-document.invalid");
    return /^(https?:)$/.test(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
