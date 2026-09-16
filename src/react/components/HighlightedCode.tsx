import { useEffect, useState } from "react";
import type { Highlighter } from "shiki";
import { cn } from "../libs/utils";

// Bound retained HTML and bypass highlighting for oversized examples.
const highlightCache = new Map<string, string>();

const highlighters = new Map<string, Promise<Highlighter>>();

/** Load only requested grammars; never dispose the shared Shiki singleton. */
function getHighlighter(language: string): Promise<Highlighter> {
  let pending = highlighters.get(language);
  if (!pending) {
    pending = import("shiki").then(({ getSingletonHighlighter }) => getSingletonHighlighter({
      themes: ["github-dark", "github-light"], langs: [language],
    })).catch((error) => {
      highlighters.delete(language);
      throw error;
    });
    highlighters.set(language, pending);
  }
  return pending;
}

let cacheSize = 0;
function cacheHighlight(key: string, html: string) {
  const size = key.length + html.length;
  if (size > 250000) return;
  while (highlightCache.size >= 64 || cacheSize + size > 1000000) {
    const oldest = highlightCache.keys().next().value;
    if (oldest === undefined) break;
    cacheSize -= oldest.length + highlightCache.get(oldest)!.length;
    highlightCache.delete(oldest);
  }
  const previous = highlightCache.get(key);
  if (previous !== undefined) cacheSize -= key.length + previous.length;
  highlightCache.set(key, html);
  cacheSize += size;
}

type HighlightedCodeProps = {
  code: string;
  language: string;
  theme: "light" | "dark";
  className?: string;
};

/**
 * Renders syntax-highlighted code using the shared shiki singleton.
 * Falls back to plain <pre><code> while the highlighter loads or on error.
 */
export function HighlightedCode({
  code,
  language,
  theme,
  className,
}: HighlightedCodeProps) {
  const [result, setResult] = useState({ key: "", html: "" });
  const key = JSON.stringify([code, language, theme]);
  const html = result.key === key ? result.html : "";

  useEffect(() => {
    let cancelled = false;

    if (code.length > 50000) return;
    const cached = highlightCache.get(key);
    if (cached) { setResult({ key, html: cached }); return; }

    getHighlighter(language)
      .then((highlighter) => {
        if (cancelled) return;
        try {
          const result = highlighter.codeToHtml(code, {
            lang: language,
            theme: theme === "dark" ? "github-dark" : "github-light",
          });
          if (!cancelled) {
            cacheHighlight(key, result);
            setResult({ key, html: result });
          }
        } catch {
          if (!cancelled) setResult({ key, html: "" });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key, html: "" });
      });

    return () => {
      cancelled = true;
    };
  }, [code, language, theme, key]);

  if (html) {
    return (
      <div
        className={cn("pde-oas-highlighted-code", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre
      className={cn(
        "pde-oas-highlighted-code",
        "pde-oas-code-plain",
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}

/** Map codegen language IDs to shiki grammar IDs. */
