import { afterEach, expect, it, vi } from "vitest";
import { copyToClipboard } from "../../src/react/libs/utils";
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
it("removes temporary inputs and restores focus when legacy copying throws", async () => {
  const button = document.createElement("button");
  document.body.append(button); button.focus();
  Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => { throw new Error("Denied"); }) });
  expect(await copyToClipboard("text")).toBe(false);
  expect(document.querySelector("textarea")).toBeNull();
  expect(document.activeElement).toBe(button);
});
it("reports successful modern clipboard writes", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  expect(await copyToClipboard("sample")).toBe(true);
  expect(writeText).toHaveBeenCalledWith("sample");
});
