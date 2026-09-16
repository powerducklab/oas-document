import { describe, expect, it } from "vitest";
import { parseOperations } from "../../src/core";
import { buildOperationTreeIndex, buildOrderedOperations, walkTree, safeNavigationHref } from "../../src/react/libs/utils";
import type { TreeNode } from "@powerduck/tree";

function fixture(count: number) {
  const paths = Object.fromEntries(Array.from({ length: count }, (_, i) => [`/items/${i}`, { get: { responses: { "200": { description: "OK" } } } }]));
  const operations = parseOperations({ openapi: "3.2.0", info: { title: "Scale", version: "1" }, paths });
  const tree = operations.map((op, i) => ({ id: `node-${i}`, name: op.path, metadata: { kind: "operation", method: op.method, path: op.path } })) as TreeNode[];
  return { tree, operations };
}

describe("navigation indexing", () => {
  it("indexes 10000 endpoints and preserves tree order without repeated scans", () => {
    const { tree, operations } = fixture(10000);
    tree.reverse();
    const index = buildOperationTreeIndex(tree, operations);
    expect(index.size).toBe(10000);
    expect(index.get(operations[9999].id)).toBe("node-9999");
    const ordered = buildOrderedOperations(tree, operations);
    expect(ordered.map((op) => op.id)).toEqual([...operations].reverse().map((op) => op.id));
  });
  it("deduplicates operations grouped under multiple tags", () => {
    const { tree, operations } = fixture(2);
    expect(buildOrderedOperations([tree[0], tree[0]], operations)).toEqual(operations);
  });
  it("traverses deep and cyclic trees without recursion overflow", () => {
    const root = { id: "root", name: "Root", children: [] } as TreeNode;
    let node = root;
    for (let i = 0; i < 15000; i++) {
      const child = { id: String(i), name: "Child", children: [] } as TreeNode;
      node.children = [child]; node = child;
    }
    node.children = [root];
    let visited = 0;
    walkTree([root], () => visited++);
    expect(visited).toBe(15001);
  });
});

describe("navigation URLs", () => {
  it.each(["javascript:alert(1)", "data:text/html,test", "file:///etc/hosts", " java\nscript:alert(1)"])("rejects unsafe URL %s", (url) => {
    expect(safeNavigationHref(url)).toBeUndefined();
  });
  it.each(["https://example.com/docs", "/docs", "#parameters"])("preserves safe URL %s", (url) => {
    expect(safeNavigationHref(url)).toBe(url);
  });
});
