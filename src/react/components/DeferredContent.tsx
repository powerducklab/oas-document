import { useEffect, useRef, useState, type ReactNode } from "react";

type ObserverPool = {
  observer: IntersectionObserver;
  listeners: Map<Element, () => void>;
};
const pools = new WeakMap<Element, ObserverPool>();

/** Shares one observer per reading pane and releases it when no work remains. */
export function observeNearby(element: Element, root: Element, reveal: () => void) {
  let pool = pools.get(root);
  if (!pool) {
    const listeners = new Map<Element, () => void>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) listeners.get(entry.target)?.();
      }
    }, { root, rootMargin: "600px 0px" });
    pool = { observer, listeners };
    pools.set(root, pool);
  }
  const activePool = pool;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    activePool.observer.unobserve(element);
    activePool.listeners.delete(element);
    if (!activePool.listeners.size) {
      activePool.observer.disconnect();
      pools.delete(root);
    }
  };
  activePool.listeners.set(element, () => { dispose(); reveal(); });
  activePool.observer.observe(element);
  return dispose;
}

/** Defers code generation and highlighting until the section approaches view. */
export function DeferredContent({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const root = element?.closest(".pde-oas-content");
    if (!element || !root || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    return observeNearby(element, root, () => setReady(true));
  }, []);
  return <div ref={ref} className="pde-oas-deferred-code">
    {ready ? children : <div className="pde-oas-code-placeholder" aria-hidden="true">Code example</div>}
  </div>;
}
