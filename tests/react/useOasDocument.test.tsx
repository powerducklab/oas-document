import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { LoadOasDocumentResult } from "../../src/core/loader";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../src/core", async (original) => ({ ...await original<object>(), loadOasDocument: mocks.load }));
import { useOasDocument } from "../../src/react/hooks/useOasDocument";

function deferred() {
  let resolve!: (value: LoadOasDocumentResult) => void;
  const promise = new Promise<LoadOasDocumentResult>((done) => { resolve = done; });
  return { promise, resolve };
}
function result(title: string): LoadOasDocumentResult {
  return { document: { openapi: "3.2.0", info: { title, version: "1" }, paths: {} }, error: null, operations: [], navigationGroups: [], tree: [], warnings: [] };
}
it("ignores an older load completing after a newer document", async () => {
  const old = deferred(); const next = deferred();
  mocks.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const { result: state, rerender } = renderHook(({ input }) => useOasDocument(input), { initialProps: { input: "old" } });
  rerender({ input: "new" });
  await act(async () => next.resolve(result("New")));
  await waitFor(() => expect(state.current.document?.info.title).toBe("New"));
  await act(async () => old.resolve(result("Old")));
  expect(state.current.document?.info.title).toBe("New");
});
