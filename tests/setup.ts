import "@testing-library/jest-dom/vitest";

// jsdom does not provide IntersectionObserver — stub it for scroll-spy tests.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as Record<string, unknown>).IntersectionObserver =
  IntersectionObserverStub;
