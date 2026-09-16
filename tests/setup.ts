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
