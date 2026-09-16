import { useEffect, useRef, useState } from "react";
import { FiCheck, FiClipboard } from "react-icons/fi";
import { SiMarkdown } from "react-icons/si";
import { buildOperationMarkdown, type OasOperation, type OpenApiDocument } from "../../core";
import { copyToClipboard } from "../libs/utils";
import { useCodePreferences } from "./CodePreferences";
import { Drawer } from "./Drawer";

export function OperationExportActions({ document, operation, serverUrl }: {
  document: OpenApiDocument;
  operation: OasOperation;
  serverUrl: string;
}) {
  const { selection } = useCodePreferences();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const copying = useRef(false);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    revision.current += 1;
    clearTimeout(timer.current);
    setMarkdown(null);
    setStatus("");
  }, [document, operation, serverUrl, selection]);
  function generate() {
    try { return buildOperationMarkdown(document, operation, serverUrl, selection); }
    catch { setStatus("Unable to export this operation."); return null; }
  }
  async function copy() {
    if (copying.current) return;
    const text = markdown ?? generate();
    if (text === null) return;
    copying.current = true;
    setBusy(true);
    clearTimeout(timer.current);
    const currentRevision = revision.current;
    const success = await copyToClipboard(text);
    copying.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (revision.current !== currentRevision) return;
    setStatus(success ? "Copied!" : "Copy failed. Open Markdown to copy manually.");
    timer.current = setTimeout(() => setStatus(""), 3000);
  }
  return <div className="pde-oas-export">
    <div className="pde-oas-export-actions" aria-label="Export operation">
      <button type="button" className={`pde-oas-export-button${status === "Copied!" ? " is-copied" : ""}`} onClick={copy} disabled={busy}>
        {status === "Copied!" ? <FiCheck aria-hidden="true" /> : <FiClipboard aria-hidden="true" />}
        {status === "Copied!" ? "Copied!" : "Copy for LLM"}
      </button>
      <span className="pde-oas-export-divider" aria-hidden="true" />
      <button type="button" className="pde-oas-export-button" onClick={() => setMarkdown(generate())}><SiMarkdown aria-hidden="true" />View as Markdown</button>
    </div>
    {markdown === null && <span className={status && status !== "Copied!" ? "pde-oas-export-error" : "pde-oas-sr-only"} role="status">{status}</span>}
    <Drawer open={markdown !== null} onClose={() => setMarkdown(null)} label="Markdown" side="right" className="pde-oas-markdown-drawer">
      <div className="pde-oas-markdown-toolbar">
        <div className="pde-oas-markdown-endpoint">
          <span className={`pde-oas-method-label pde-oas-method-${operation.method}`}>{operation.method.toUpperCase()}</span>
          <code title={operation.path}>{operation.path}</code>
        </div>
        <button type="button" className={`pde-oas-export-button${status === "Copied!" ? " is-copied" : ""}`} onClick={copy} disabled={busy}>{status === "Copied!" ? <FiCheck aria-hidden="true" /> : <FiClipboard aria-hidden="true" />}{status === "Copied!" ? "Copied!" : "Copy for LLM"}</button>
      </div>
      <textarea className="pde-oas-markdown-source" aria-label="Operation Markdown" readOnly value={markdown ?? ""} spellCheck={false} />
      <span className={status && status !== "Copied!" ? "pde-oas-export-error pde-oas-markdown-error" : "pde-oas-sr-only"} role="status">{status}</span>
    </Drawer>
  </div>;
}
