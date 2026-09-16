import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DeferredContent } from "../../src/react/components/DeferredContent";

afterEach(() => { vi.unstubAllGlobals(); });
describe("deferred code", () => {
  it("shares one observer, mounts only nearby examples, and releases observers", () => {
    let notify: IntersectionObserverCallback = () => {};
    const observe = vi.fn(); const unobserve = vi.fn(); const disconnect = vi.fn();
    const Observer = vi.fn(function (callback: IntersectionObserverCallback) {
      notify = callback; return { observe, unobserve, disconnect };
    });
    vi.stubGlobal("IntersectionObserver", Observer);
    const { container, unmount } = render(<div className="pde-oas-content"><DeferredContent><span>First example</span></DeferredContent><DeferredContent><span>Second example</span></DeferredContent></div>);
    expect(Observer).toHaveBeenCalledOnce();
    expect(screen.queryByText("First example")).not.toBeInTheDocument();
    const target = container.querySelector(".pde-oas-deferred-code")!;
    act(() => notify([{ target, isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(screen.getByText("First example")).toBeInTheDocument();
    expect(screen.queryByText("Second example")).not.toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("renders immediately when observation is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<div className="pde-oas-content"><DeferredContent>Fallback example</DeferredContent></div>);
    expect(await screen.findByText("Fallback example")).toBeInTheDocument();
  });
});
