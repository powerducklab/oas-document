import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom does not provide IntersectionObserver — stub it for scroll-spy tests.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as Record<string, unknown>).IntersectionObserver =
  IntersectionObserverStub;

// jsdom does not provide ResizeObserver — stub it for Chakra Splitter tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;

// jsdom models dialog elements but does not implement their native methods.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
}

// jsdom 24 cannot parse CSS cascade layers. Keep unrelated errors visible.
if (typeof document !== "undefined") {
  const report = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const message = args[0] instanceof Error ? args[0].message : String(args[0]);
    if (message.includes("Could not parse CSS stylesheet") && typeof args[1] === "string" && args[1].startsWith("@layer")) return;
    report(...args);
  });
}
