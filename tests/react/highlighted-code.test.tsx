import { expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ codeToHtml: vi.fn((code: string) => `<pre>${code}</pre>`) }));
vi.mock("shiki", () => ({ getSingletonHighlighter: vi.fn(async () => mocks) }));
import { HighlightedCode } from "../../src/react/components/HighlightedCode";
it("never displays stale highlighted content after a code change", async () => {
  const { rerender } = render(<HighlightedCode code="first sample" language="json" theme="light" />);
  await waitFor(() => expect(mocks.codeToHtml).toHaveBeenCalled());
  await act(async () => {
    rerender(<HighlightedCode code="next sample" language="json" theme="light" />);
  });
  expect(screen.queryByText("first sample")).not.toBeInTheDocument();
  expect(screen.getByText("next sample")).toBeInTheDocument();
});
it("keeps oversized examples readable without expensive highlighting", () => {
  mocks.codeToHtml.mockClear();
  const code = "x".repeat(50001);
  const { container } = render(<HighlightedCode code={code} language="json" theme="light" />);
  expect(container.textContent).toBe(code);
  expect(mocks.codeToHtml).not.toHaveBeenCalled();
});
