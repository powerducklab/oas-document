import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodePreferencesProvider } from "../../src/react/components/CodePreferences";
import { OperationExportActions } from "../../src/react/components/OperationExportActions";
import { buildOperationMarkdown, parseOperations, type OpenApiDocument } from "../../src/core";
import { copyToClipboard } from "../../src/react/libs/utils";
vi.mock("../../src/react/libs/utils", () => ({ copyToClipboard: vi.fn() }));
const document = { openapi: "3.2.0", info: { title: "Pets", version: "1" }, paths: { "/pets": { get: { responses: { "200": { description: "OK" } } } } } } as OpenApiDocument;
const operation = parseOperations(document)[0];
const props = { document, operation, serverUrl: "https://example.com" };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("operation export actions", () => {
  it("previews raw Markdown and closes the native dialog", () => {
    render(<CodePreferencesProvider><OperationExportActions {...props} /></CodePreferencesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "View as Markdown" }));
    expect(screen.getByRole("textbox", { name: "Operation Markdown" })).toHaveValue(buildOperationMarkdown(document, operation, props.serverUrl));
    fireEvent.click(screen.getByRole("button", { name: "Close markdown" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("copies the same complete Markdown with success feedback", async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    render(<CodePreferencesProvider><OperationExportActions {...props} /></CodePreferencesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Copy for LLM" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy());
    expect(copyToClipboard).toHaveBeenCalledWith(buildOperationMarkdown(document, operation, props.serverUrl));
  });
  it("reports clipboard failure and offers manual copying", async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    render(<CodePreferencesProvider><OperationExportActions {...props} /></CodePreferencesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Copy for LLM" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copy failed"));
    fireEvent.click(screen.getByRole("button", { name: "View as Markdown" }));
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });
});
