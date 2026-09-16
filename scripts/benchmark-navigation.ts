import { performance } from "node:perf_hooks";
import { parseOperations } from "../src/core";
import { buildOperationTreeIndex, buildOrderedOperations } from "../src/react/libs/utils";
import type { TreeNode } from "@powerduck/tree";

function median(run: () => void) {
  const times: number[] = [];
  run();
  for (let i = 0; i < 5; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  return times.sort((a, b) => a - b)[2];
}
for (const count of [1000, 5000, 10000]) {
  const paths = Object.fromEntries(Array.from({ length: count }, (_, i) => [`/items/${i}`, { get: { responses: { "200": { description: "OK" } } } }]));
  const operations = parseOperations({ openapi: "3.2.0", info: { title: "Benchmark", version: "1" }, paths });
  const tree: TreeNode[] = operations.map((op, i) => ({ id: `node-${i}`, name: op.path, metadata: { kind: "operation", method: op.method, path: op.path } }));
  // The previous method/path fallback performed a linear scan for each tree node.
  const baseline = median(() => {
    for (const node of tree) {
      const metadata = node.metadata as { method: string; path: string };
      operations.find((operation) => operation.method === metadata.method && operation.path === metadata.path);
    }
  });
  const indexed = median(() => { buildOperationTreeIndex(tree, operations); });
  const ordering = median(() => { buildOrderedOperations(tree, operations); });
  console.log(JSON.stringify({ operations: count, baselineLookupMs: +baseline.toFixed(2), indexedLookupMs: +indexed.toFixed(2), orderingMs: +ordering.toFixed(2), lookupSpeedup: +(baseline / indexed).toFixed(1) }));
}
