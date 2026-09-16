import "@powerduck/tree/react/index.css";
import "@powerduck/md-editor/dist/style.css";
import "./OasDocument.css"; 

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ForwardedRef,
  ReactNode,
} from "react";

import {
  renderMarkdown,
  type RendererOptions,
} from "@powerduck/md-editor";

import {
  generate,
  list,
  registerBuiltins,
} from "@powerduck/openapi-codegen";

import {
  getPrimaryMediaType,
  getSchemaDescription,
  getSchemaEnum,
  getSchemaTypeLabel,
  getCompositeAlternatives,
  getCompositeKind,
  type CompositeAlternative,
  getProperty,
  getObjectProperty,
  isSchemaDeprecated,
  resolveSchema,
  resolveServerUrl,
  stringifyDisplayValue,
} from "../core";

import type {
  HttpMethod,
  OasOperation,
  OpenApiDocument,
  OpenApiParameter,
  OpenApiResponse,
  OpenApiSchema,
} from "../core";

import {
  createListCollection,
  ScrollArea,
  Select,
  Splitter,
} from "@chakra-ui/react";

import { getSingletonHighlighter } from "shiki";
import type { Highlighter } from "shiki";

import { Tree } from "@powerduck/tree/react";

import type { TreeHandle } from "@powerduck/tree/react";
import type { TreeNode } from "@powerduck/tree";

import { FiCopy, FiMenu } from "react-icons/fi";
import {
  AiOutlineMinusCircle,
  AiOutlinePlusCircle,
} from "react-icons/ai";
import { IoMdClose } from "react-icons/io";
import { IoMdCode } from "react-icons/io";
import { LuMoon, LuSun } from "react-icons/lu";

import { useOasDocument } from "./hooks/useOasDocument";

import type {
  OasDocumentHandle,
  OasDocumentHeaderConfig,
  OasDocumentNavItem,
  OasDocumentProps,
} from "./libs/types";

import {
  buildOperationTreeIndex,
  buildOrderedOperations,
  cn,
  copyToClipboard,
  resolveOperationFromNode,
  useMediaQuery,
} from "./libs/utils";

import { OptionalChakraProvider } from "./libs/OptionalChakraProvider";

/* ==========================================================================
   Code generator setup (module-level, idempotent)
   ========================================================================== */

registerBuiltins();

const MARKDOWN_RENDER_OPTIONS: RendererOptions = {
  codeHighlight: true,
  tips: true,
  math: false,
  mindmap: false,
};

/* ==========================================================================
   Shiki highlighter adapter (module-level, lazy async load)
   ========================================================================== */

const SHIKI_LANGS = [
  "bash",
  "javascript",
  "python",
  "go",
  "ruby",
  "php",
  "java",
  "csharp",
  "swift",
  "kotlin",
  "json",
  "shell",
  "http",
] as const;

/**
 * Module-level singleton shiki highlighter.
 *
 * `getSingletonHighlighter` caches by (themes, langs). We load it once and
 * reuse forever. Unlike Chakra's `createShikiAdapter`, we never call
 * `dispose()` — the singleton must survive component unmount/remount cycles.
 */
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = getSingletonHighlighter({
      themes: ["github-dark", "github-light"],
      langs: SHIKI_LANGS as unknown as string[],
    }).catch((err) => {
      // Reset on failure so subsequent renders can retry.
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
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
function HighlightedCode({ code, language, theme, className }: HighlightedCodeProps) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        try {
          const result = highlighter.codeToHtml(code, {
            lang: language,
            theme: theme === "dark" ? "github-dark" : "github-light",
          });
          if (!cancelled) setHtml(result);
        } catch {
          if (!cancelled) setHtml("");
        }
      })
      .catch(() => {
        if (!cancelled) setHtml("");
      });

    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  if (html) {
    return (
      <div
        className={cn("pde-oas-highlighted-code", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className={cn("pde-oas-highlighted-code", "pde-oas-code-plain", className)}>
      <code>{code}</code>
    </pre>
  );
}

/** Map codegen language IDs to shiki grammar IDs. */
const SHIKI_LANG_MAP: Record<string, string> = {
  curl: "bash",
  javascript: "javascript",
  typescript: "javascript",
  python: "python",
  go: "go",
  ruby: "ruby",
  php: "php",
  java: "java",
  csharp: "csharp",
  swift: "swift",
  kotlin: "kotlin",
  json: "json",
  shell: "shell",
  http: "http",
};

function mapLanguageToShikiLang(language: string): string {
  return SHIKI_LANG_MAP[language] ?? "bash";
}

/* ==========================================================================
   Generator options — grouped by language (two-level selector)
   ========================================================================== */

/**
 * Returns the full list of available generators grouped by language.
 */
function getLanguageGroups(): Map<string, string[]> {
  const available = list();
  const groups = new Map<string, string[]>();

  for (const gen of available) {
    const clients = groups.get(gen.language);

    if (clients) {
      if (!clients.includes(gen.client)) {
        clients.push(gen.client);
      }
    } else {
      groups.set(gen.language, [gen.client]);
    }
  }

  return groups;
}

/* ==========================================================================
   Constants
   ========================================================================== */

const METHOD_LABELS: Record<HttpMethod, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE",
};

const METHOD_CLASS_NAMES: Record<HttpMethod, string> = {
  get: "pde-oas-method-get",
  post: "pde-oas-method-post",
  put: "pde-oas-method-put",
  patch: "pde-oas-method-patch",
  delete: "pde-oas-method-delete",
  head: "pde-oas-method-head",
  options: "pde-oas-method-options",
  trace: "pde-oas-method-trace",
};

const TABLET_BREAKPOINT = 1040;
const MOBILE_BREAKPOINT = 720;

type OasRootDocument = OpenApiDocument;

/* ==========================================================================
   Internal schema helpers (preserved from original)
   ========================================================================== */

function resolveJsonPointer(
  document: unknown,
  ref: string,
): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) =>
      decodeURIComponent(segment.replace(/~1/g, "/").replace(/~0/g, "~")),
    );

  let node: unknown = document;

  for (const segment of segments) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }

    node = (node as Record<string, unknown>)[segment];
  }

  return node;
}

function mergeSchemaObjects(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const baseProperties =
    (base.properties as Record<string, unknown>) || {};
  const nextProperties =
    (next.properties as Record<string, unknown>) || {};

  const baseRequired = Array.isArray(base.required) ? base.required : [];
  const nextRequired = Array.isArray(next.required) ? next.required : [];

  return {
    ...base,
    ...next,
    properties: { ...baseProperties, ...nextProperties },
    required: Array.from(new Set([...baseRequired, ...nextRequired])),
  };
}

function resolveSchemaRef(
  schema: unknown,
  document: OasRootDocument,
  seen: Set<string> = new Set(),
): OpenApiSchema | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }

  const schemaObject = schema as Record<string, unknown>;
  const ref = schemaObject.$ref;

  if (typeof ref === "string") {
    if (seen.has(ref)) {
      return undefined;
    }

    const nextSeen = new Set(seen);
    nextSeen.add(ref);

    return resolveSchemaRef(
      resolveJsonPointer(document, ref),
      document,
      nextSeen,
    );
  }

  const allOf = schemaObject.allOf;

  if (Array.isArray(allOf) && allOf.length > 0) {
    const merged = allOf.reduce<Record<string, unknown>>(
      (accumulator, entry) => {
        const resolvedEntry = resolveSchemaRef(entry, document, seen) as
          | Record<string, unknown>
          | undefined;

        return resolvedEntry
          ? mergeSchemaObjects(accumulator, resolvedEntry)
          : accumulator;
      },
      {},
    );

    const { allOf: _allOf, ...rest } = schemaObject;

    return mergeSchemaObjects(merged, rest) as OpenApiSchema;
  }

  return (
    (resolveSchema(schemaObject as OpenApiSchema) ??
      (schemaObject as OpenApiSchema)) as OpenApiSchema
  );
}

type SchemaField = {
  path: string;
  name: string;
  schema: OpenApiSchema;
  required: boolean;
};

function getDirectFields(
  schema: OpenApiSchema | undefined,
  document: OasRootDocument,
): SchemaField[] {
  const resolved = resolveSchemaRef(schema, document) as
    | Record<string, unknown>
    | undefined;

  if (!resolved) {
    return [];
  }

  if (resolved.type === "array" && resolved.items) {
    return getDirectFields(resolved.items as OpenApiSchema, document);
  }

  const properties = resolved.properties as
    | Record<string, OpenApiSchema>
    | undefined;

  if (!properties) {
    return [];
  }

  const requiredList = Array.isArray(resolved.required)
    ? (resolved.required as string[])
    : [];

  return Object.entries(properties).map(([name, propertySchema]) => ({
    path: name,
    name,
    schema: (resolveSchemaRef(propertySchema, document) ??
      propertySchema) as OpenApiSchema,
    required: requiredList.includes(name),
  }));
}

function buildExampleValue(
  schema: unknown,
  document: OasRootDocument,
  depth = 0,
): unknown {
  if (depth > 6) {
    return null;
  }

  const resolved = resolveSchemaRef(schema, document) as
    | Record<string, unknown>
    | undefined;

  if (!resolved) {
    return null;
  }

  if (resolved.example !== undefined) {
    return resolved.example;
  }

  if (resolved.default !== undefined) {
    return resolved.default;
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }

  /* oneOf / anyOf: pick the first alternative for example building. */
  const oneOf = resolved.oneOf as unknown;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return buildExampleValue(oneOf[0], document, depth + 1);
  }

  const anyOf = resolved.anyOf as unknown;
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    return buildExampleValue(anyOf[0], document, depth + 1);
  }

  const type = resolved.type as string | undefined;

  if (type === "array") {
    return [buildExampleValue(resolved.items, document, depth + 1)];
  }

  if (type === "object" || resolved.properties) {
    const properties = (resolved.properties as Record<string, unknown>) || {};

    return Object.fromEntries(
      Object.entries(properties).map(([name, propertySchema]) => [
        name,
        buildExampleValue(propertySchema, document, depth + 1),
      ]),
    );
  }

  if (type === "integer" || type === "number") {
    return resolved.format === "int64" ? 1234567890 : 0;
  }

  if (type === "boolean") {
    return true;
  }

  const format = resolved.format as string | undefined;

  if (format === "date-time") {
    return "2026-01-01T00:00:00Z";
  }

  if (format === "date") {
    return "2026-01-01";
  }

  if (format === "email") {
    return "user@example.com";
  }

  if (format === "uuid") {
    return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
  }

  return "string";
}

function stringifyExample(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getParameterSchema(
  parameter: OpenApiParameter,
  document: OasRootDocument,
): OpenApiSchema | undefined {
  const parameterValue: unknown = parameter;

  const directSchema = getProperty(parameterValue, "schema");

  if (directSchema !== undefined) {
    return resolveSchemaRef(directSchema, document);
  }

  const content = getObjectProperty(parameterValue, "content");

  if (!content) {
    return undefined;
  }

  for (const mediaType of Object.values(content)) {
    const schema = getProperty(mediaType, "schema");

    if (schema !== undefined) {
      return resolveSchemaRef(schema, document);
    }
  }

  return undefined;
}

function getResponseDescription(response: OpenApiResponse): string {
  return response.description || "No description provided.";
}

function getResponseMediaTypes(response: OpenApiResponse): string[] {
  return response.content ? Object.keys(response.content) : [];
}

function sortResponseEntries(
  entries: Array<[string, OpenApiResponse]>,
): Array<[string, OpenApiResponse]> {
  return [...entries].sort(([left], [right]) => {
    if (left === "default") {
      return 1;
    }

    if (right === "default") {
      return -1;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return left.localeCompare(right);
  });
}

function getResponseStatusClass(status: string): string {
  if (status === "default") {
    return "pde-oas-status-default";
  }

  if (status.startsWith("2")) {
    return "pde-oas-status-success";
  }

  if (status.startsWith("4") || status.startsWith("5")) {
    return "pde-oas-status-error";
  }

  return "pde-oas-status-default";
}

function getResponseStatusLabel(status: string): string {
  return status === "default" ? "Other" : status;
}

/* ==========================================================================
   Markdown (via @powerduck/md-editor renderMarkdown)
   ========================================================================== */

type MarkdownProps = {
  children: string;
  className?: string;
};

function Markdown({ children, className }: MarkdownProps) {
  const html = useMemo(() => {
    if (!children) {
      return "";
    }

    try {
      return renderMarkdown(children, MARKDOWN_RENDER_OPTIONS);
    } catch {
      return "";
    }
  }, [children]);

  return (
    <div
      className={cn("pde-oas-markdown", "markdown-body", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ==========================================================================
   Copy button
   ========================================================================== */

type CopyButtonProps = {
  text: string;
  variant: "dark" | "light";
};

const CopyButton = memo(function CopyButton({
  text,
  variant,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    const ok = await copyToClipboard(text);

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }, [text]);

  return (
    <button
      type="button"
      className={cn(
        "pde-oas-copy-button",
        "pde-oas-copy-button-icon",
        variant === "dark"
          ? "pde-oas-copy-button-dark"
          : "pde-oas-copy-button-light",
        copied && "is-copied",
      )}
      onClick={handleClick}
      title={copied ? "Copied" : "Copy code"}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      <FiCopy size={14} />
    </button>
  );
});

/* ==========================================================================
   Click-to-copy field name (parameter / schema property)
   ========================================================================== */

type FieldNameProps = {
  name: string;
};

const FieldName = memo(function FieldName({ name }: FieldNameProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handleClick = useCallback(async () => {
    const ok = await copyToClipboard(name);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setStatus(ok ? "copied" : "error");

    timerRef.current = window.setTimeout(() => setStatus("idle"), 1500);
  }, [name]);

  return (
    <code
      className={cn(
        "pde-oas-field-name",
        status === "copied" && "pde-oas-field-name-copied",
      )}
      title="Click to copy"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void handleClick();
        }
      }}
    >
      {name}
      {status !== "idle" ? (
        <span
          className={cn(
            "pde-oas-copied-tooltip",
            "is-visible",
            status === "error" && "is-error",
          )}
        >
          {status === "copied" ? "Copied!" : "Failed"}
        </span>
      ) : null}
    </code>
  );
});

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="pde-oas-empty-state">
      <div className="pde-oas-empty-state-icon">
        <p>{"{}"}</p>
      </div>
      <h2 className="pde-oas-empty-state-title">{title}</h2>
      <p className="pde-oas-empty-state-description">{description}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="pde-oas-loading-state">
      <div className="pde-oas-spinner" aria-label="Loading" />
      <p className="pde-oas-loading-text">Loading API documentation…</p>
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="pde-oas-error-state">
      <h2 className="pde-oas-error-title">Failed to load API document</h2>
      <p className="pde-oas-error-description">{error.message}</p>
    </div>
  );
}

/* ==========================================================================
   Method label
   ========================================================================== */

function OperationMethodLabel({
  method,
  className,
}: {
  method: HttpMethod;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pde-oas-method-label",
        METHOD_CLASS_NAMES[method],
        className,
      )}
    >
      {METHOD_LABELS[method]}
    </span>
  );
}

/* ==========================================================================
   Section header
   ========================================================================== */

type SectionHeaderProps = {
  title: string;
  description?: string;
  count?: number;
};

function SectionHeader({ title, description, count }: SectionHeaderProps) {
  return (
    <div className="pde-oas-section-header">
      <div className="pde-oas-section-header-row">
        <h3 className="pde-oas-section-title">{title}</h3>
        {typeof count === "number" ? (
          <span className="pde-oas-section-count">{count}</span>
        ) : null}
      </div>
      {description ? <Markdown>{description}</Markdown> : null}
    </div>
  );
}

/* ==========================================================================
   Expandable field rows
   ========================================================================== */

type ExpandableChildFieldsProps = {
  expanded: boolean;
  onToggle: () => void;
  fields: SchemaField[];
  document: OasRootDocument;
};

function ExpandableChildFields({
  expanded,
  onToggle,
  fields,
  document,
}: ExpandableChildFieldsProps) {
  return (
    <>
      <button
        type="button"
        className="pde-oas-show-children-button"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded ? <AiOutlineMinusCircle /> : <AiOutlinePlusCircle />}
        {expanded ? "Hide child parameters" : "Show child parameters"}
      </button>

      {expanded ? (
        <div className="pde-oas-child-field-list">
          {fields.map((field) => (
            <SchemaFieldRow
              key={field.path}
              field={field}
              document={document}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Composite schema tabs (oneOf / anyOf)
   ========================================================================== */

type CompositeSchemaTabsProps = {
  alternatives: CompositeAlternative[];
  document: OasRootDocument;
  kind: "oneOf" | "anyOf";
};

function CompositeSchemaTabs({
  alternatives,
  document,
  kind,
}: CompositeSchemaTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (alternatives.length === 0) {
    return null;
  }

  const safeIndex = Math.min(activeIndex, alternatives.length - 1);
  const active = alternatives[safeIndex];

  return (
    <div className="pde-oas-composite-tabs">
      <div className="pde-oas-composite-tabs-header">
        <span className="pde-oas-composite-tabs-kind">{kind}</span>
        <div className="pde-oas-composite-tabs-list">
          {alternatives.map((alt, index) => (
            <button
              key={`${alt.label}-${index}`}
              type="button"
              className={
                index === safeIndex
                  ? "pde-oas-composite-tab pde-oas-composite-tab-active"
                  : "pde-oas-composite-tab"
              }
              onClick={() => setActiveIndex(index)}
            >
              {alt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pde-oas-composite-tabs-content">
        {active ? (
          <SchemaBlock schema={active.schema} document={document} />
        ) : null}
      </div>
    </div>
  );
}

type SchemaFieldRowProps = {
  field: SchemaField;
  document: OasRootDocument;
};

/**
 * Returns a compact, single-line constraint label for a schema, e.g.
 * `[0, 100] nullable`, `enum: [a, b, c] read-only`, `pattern: ^[a-z]+$`.
 * Returns an empty string when the schema has no constraints to show.
 */
function getSchemaConstraintLabel(
  schema: OpenApiSchema | undefined,
): string {
  if (!schema) return "";

  const record = schema as Record<string, unknown>;
  const parts: string[] = [];

  // Numeric range — OAS 3.0 uses booleans for exclusive, 3.1 uses numbers.
  const minimum = typeof record.minimum === "number" ? record.minimum : undefined;
  const maximum = typeof record.maximum === "number" ? record.maximum : undefined;
  const exclMin = record.exclusiveMinimum;
  const exclMax = record.exclusiveMaximum;
  const hasNumeric =
    minimum !== undefined ||
    maximum !== undefined ||
    typeof exclMin === "number" ||
    typeof exclMax === "number" ||
    exclMin === true ||
    exclMax === true;

  if (hasNumeric) {
    // Resolve lower bound
    let lower: string;
    let lowerInclusive = true;
    if (typeof exclMin === "number") {
      lower = String(exclMin);
      lowerInclusive = false;
    } else if (exclMin === true) {
      lower = String(minimum ?? "");
      lowerInclusive = false;
    } else {
      lower = String(minimum ?? "");
    }

    // Resolve upper bound
    let upper: string;
    let upperInclusive = true;
    if (typeof exclMax === "number") {
      upper = String(exclMax);
      upperInclusive = false;
    } else if (exclMax === true) {
      upper = String(maximum ?? "");
      upperInclusive = false;
    } else {
      upper = String(maximum ?? "");
    }

    if (lower !== "" || upper !== "") {
      const open = lowerInclusive ? "[" : "(";
      const close = upperInclusive ? "]" : ")";
      parts.push(`${open}${lower}, ${upper}${close}`);
    }
  }

  // String length
  const minLen = typeof record.minLength === "number" ? record.minLength : undefined;
  const maxLen = typeof record.maxLength === "number" ? record.maxLength : undefined;
  if (minLen !== undefined || maxLen !== undefined) {
    parts.push(`[${minLen ?? ""}, ${maxLen ?? ""}]`);
  }

  // Array items
  const minItems = typeof record.minItems === "number" ? record.minItems : undefined;
  const maxItems = typeof record.maxItems === "number" ? record.maxItems : undefined;
  if (minItems !== undefined || maxItems !== undefined) {
    let range = `[${minItems ?? ""}, ${maxItems ?? ""}]`;
    if (record.uniqueItems === true) range += " unique";
    parts.push(range);
  }

  // Enum
  const enumValues = getSchemaEnum(schema);
  if (enumValues.length > 0) {
    let enumLabel = `enum: [${enumValues.map(stringifyDisplayValue).join(", ")}]`;
    if (enumLabel.length > 60) {
      enumLabel = enumLabel.slice(0, 57) + "…]";
    }
    parts.push(enumLabel);
  }

  // Pattern
  if (typeof record.pattern === "string") {
    let pattern = record.pattern;
    if (pattern.length > 40) {
      pattern = pattern.slice(0, 37) + "…";
    }
    parts.push(`pattern: ${pattern}`);
  }

  // Metadata flags
  if (record.nullable === true) parts.push("nullable");
  if (record.readOnly === true) parts.push("read-only");
  if (record.writeOnly === true) parts.push("write-only");
  if (isSchemaDeprecated(schema)) parts.push("deprecated");

  // Default — only for simple scalar values
  if (Object.prototype.hasOwnProperty.call(record, "default")) {
    const def = record.default;
    if (
      typeof def === "string" ||
      typeof def === "number" ||
      typeof def === "boolean"
    ) {
      parts.push(`= ${stringifyDisplayValue(def)}`);
    }
  }

  return parts.join(" ");
}

function SchemaFieldRow({ field, document }: SchemaFieldRowProps) {
  const [expanded, setExpanded] = useState(false);

  const { schema } = field;

  const childFields = useMemo(
    () => getDirectFields(schema, document),
    [schema, document],
  );

  const compositeKind = getCompositeKind(schema);
  const compositeAlternatives = useMemo(
    () =>
      compositeKind && compositeKind !== "allOf"
        ? getCompositeAlternatives(schema, document)
        : [],
    [schema, document, compositeKind],
  );

  const description = getSchemaDescription(schema);
  const constraints = getSchemaConstraintLabel(schema);

  return (
    <div className="pde-oas-field-row">
      <div className="pde-oas-field-row-head">
        <FieldName name={field.name} />
        <span className="pde-oas-field-type">
          {getSchemaTypeLabel(schema)}
        </span>
        {constraints ? (
          <span className="pde-oas-field-constraints">{constraints}</span>
        ) : null}
        {field.required ? (
          <span className="pde-oas-field-required">required</span>
        ) : null}
      </div>

      {description ? (
        <Markdown className="pde-oas-field-description">{description}</Markdown>
      ) : null}

      {compositeAlternatives.length > 0 && compositeKind && compositeKind !== "allOf" ? (
        <CompositeSchemaTabs
          alternatives={compositeAlternatives}
          document={document}
          kind={compositeKind}
        />
      ) : null}

      {childFields.length > 0 ? (
        <ExpandableChildFields
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          fields={childFields}
          document={document}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Parameters
   ========================================================================== */

type ParameterRowProps = {
  parameter: OpenApiParameter;
  document: OasRootDocument;
};

function ParameterRow({ parameter, document }: ParameterRowProps) {
  const [expanded, setExpanded] = useState(false);

  const schema = useMemo(
    () => getParameterSchema(parameter, document),
    [parameter, document],
  );

  const childFields = useMemo(
    () => getDirectFields(schema, document),
    [schema, document],
  );

  const schemaConstraints = getSchemaConstraintLabel(schema);
  const paramDeprecated =
    (parameter as Record<string, unknown>).deprecated === true;
  const constraints = paramDeprecated
    ? schemaConstraints
      ? `${schemaConstraints} deprecated`
      : "deprecated"
    : schemaConstraints;

  return (
    <div className="pde-oas-field-row">
      <div className="pde-oas-field-row-head">
        <FieldName name={parameter.name} />
        <span className="pde-oas-field-type">
          {schema ? getSchemaTypeLabel(schema) : "unknown"}
        </span>
        {constraints ? (
          <span className="pde-oas-field-constraints">{constraints}</span>
        ) : null}
        <span className="pde-oas-location-badge">{parameter.in}</span>
        {parameter.required ? (
          <span className="pde-oas-field-required">required</span>
        ) : null}
      </div>

      {parameter.description ? (
        <Markdown className="pde-oas-field-description">
          {parameter.description}
        </Markdown>
      ) : null}

      {childFields.length > 0 ? (
        <ExpandableChildFields
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          fields={childFields}
          document={document}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Schema block
   ========================================================================== */

type SchemaBlockProps = {
  schema: OpenApiSchema;
  document: OasRootDocument;
};

function SchemaBlock({ schema, document }: SchemaBlockProps) {
  const resolved = useMemo(
    () => resolveSchemaRef(schema, document),
    [schema, document],
  );

  const fields = useMemo(
    () => (resolved ? getDirectFields(resolved, document) : []),
    [resolved, document],
  );

  const compositeKind = getCompositeKind(resolved);
  const compositeAlternatives = useMemo(
    () =>
      compositeKind && compositeKind !== "allOf" && resolved
        ? getCompositeAlternatives(resolved, document)
        : [],
    [resolved, document, compositeKind],
  );

  if (!resolved) {
    return (
      <p className="pde-oas-empty-section-text">
        This schema could not be resolved.
      </p>
    );
  }

  if (compositeKind && compositeKind !== "allOf" && compositeAlternatives.length > 0) {
    return (
      <CompositeSchemaTabs
        alternatives={compositeAlternatives}
        document={document}
        kind={compositeKind}
      />
    );
  }

  if (fields.length === 0) {
    return (
      <div className="pde-oas-schema-primitive">
        <span className="pde-oas-field-type">
          {getSchemaTypeLabel(resolved)}
        </span>
      </div>
    );
  }

  return (
    <div className="pde-oas-field-list">
      {fields.map((field) => (
        <SchemaFieldRow
          key={field.path}
          field={field}
          document={document}
        />
      ))}
    </div>
  );
}

/* ==========================================================================
   Request body
   ========================================================================== */

type RequestBodySectionProps = {
  operation: OasOperation;
  document: OasRootDocument;
};

function RequestBodySection({ operation, document }: RequestBodySectionProps) {
  const requestBody = operation.requestBody;

  if (!requestBody) {
    return null;
  }

  const mediaEntry = getPrimaryMediaType(requestBody.content);

  const mediaTypeName = mediaEntry?.[0];
  const mediaType = mediaEntry?.[1];

  const rawSchema = getProperty(mediaType, "schema");

  const schema =
    rawSchema !== undefined
      ? resolveSchemaRef(rawSchema, document)
      : undefined;

  return (
    <section className="pde-oas-section">
      <SectionHeader
        title="Request body"
        description={
          requestBody.description ||
          "The request body accepted by this endpoint."
        }
      />

      <div className="pde-oas-panel-card">
        <div className="pde-oas-panel-card-header">
          <span className="pde-oas-content-type-badge">
            {mediaTypeName || "application/json"}
          </span>
          <span
            className={cn(
              "pde-oas-field-required",
              !requestBody.required && "pde-oas-field-optional",
            )}
          >
            {requestBody.required ? "Required" : "Optional"}
          </span>
        </div>

        <div className="pde-oas-panel-card-body">
          {schema ? (
            <SchemaBlock schema={schema} document={document} />
          ) : (
            <p className="pde-oas-empty-section-text">
              No schema is defined for this request body.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Responses
   ========================================================================== */

type ResponsesSectionProps = {
  operation: OasOperation;
  document: OasRootDocument;
};

function ResponsesSection({ operation, document }: ResponsesSectionProps) {
  const responseEntries = useMemo(
    () => sortResponseEntries(Object.entries(operation.responses)),
    [operation.responses],
  );

  return (
    <section className="pde-oas-section">
      <SectionHeader
        title="Responses"
        description="Possible responses returned by this endpoint."
        count={responseEntries.length}
      />

      <div className="pde-oas-responses-stack">
        {responseEntries.map(([status, response]) => {
          const mediaTypes = getResponseMediaTypes(response);

          return (
            <div key={status} className="pde-oas-panel-card">
              <div className="pde-oas-panel-card-header">
                <span
                  className={cn(
                    "pde-oas-status-badge",
                    getResponseStatusClass(status),
                  )}
                >
                  {getResponseStatusLabel(status)}
                </span>

                <span className="pde-oas-response-description">
                  {getResponseDescription(response)}
                </span>

                {mediaTypes.length > 0 ? (
                  <span className="pde-oas-response-media-types">
                    {mediaTypes.map((mediaType) => (
                      <span
                        key={mediaType}
                        className="pde-oas-content-type-badge"
                      >
                        {mediaType}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>

              {response.content ? (
                <div className="pde-oas-panel-card-body">
                  {Object.entries(response.content).map(
                    ([mediaTypeName, mediaType]) => {
                      const rawSchema = getProperty(mediaType, "schema");

                      const schema =
                        rawSchema !== undefined
                          ? resolveSchemaRef(rawSchema, document)
                          : undefined;

                      if (!schema) {
                        return null;
                      }

                      return (
                        <SchemaBlock
                          key={mediaTypeName}
                          schema={schema}
                          document={document}
                        />
                      );
                    },
                  )}
                </div>
              ) : (
                <div className="pde-oas-panel-card-body">
                  <p className="pde-oas-empty-section-text">No response body.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ==========================================================================
   Code examples panel (request dark + response light)
   ========================================================================== */

type CodeExamplesPanelProps = {
  operation: OasOperation;
  serverUrl: string;
  document: OasRootDocument;
  languageGroups: Map<string, string[]>;
  theme: "light" | "dark";
  onRequestClose?: () => void;
};

function CodeExamplesPanel({
  operation,
  serverUrl,
  document,
  languageGroups,
  theme,
  onRequestClose,
}: CodeExamplesPanelProps) {
  const languages = useMemo(
    () => Array.from(languageGroups.keys()),
    [languageGroups],
  );

  // Prefer shell/curl (generates curl commands); fall back to first available.
  const defaultLanguage = languages.includes("shell")
    ? "shell"
    : languages[0] ?? "shell";
  const defaultClients = languageGroups.get(defaultLanguage) ?? [];
  const defaultClient = defaultClients.includes("curl")
    ? "curl"
    : defaultClients[0] ?? "";

  const [language, setLanguage] = useState(defaultLanguage);
  const [client, setClient] = useState(defaultClient);

  // Reset when the language groups change (e.g. new document loaded).
  useEffect(() => {
    const lang = languages.includes("shell") ? "shell" : languages[0] ?? "shell";
    const clients = languageGroups.get(lang) ?? [];
    setLanguage(lang);
    setClient(clients.includes("curl") ? "curl" : clients[0] ?? "");
  }, [languageGroups, languages]);

  const availableClients = languageGroups.get(language) ?? [];

  const languageCollection = useMemo(
    () => createListCollection({ items: languages }),
    [languages],
  );

  const clientCollection = useMemo(
    () => createListCollection({ items: availableClients }),
    [availableClients],
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      setLanguage(nextLanguage);
      const clients = languageGroups.get(nextLanguage) ?? [];
      setClient(clients[0] ?? "");
    },
    [languageGroups],
  );

  const responseEntries = useMemo(
    () => sortResponseEntries(Object.entries(operation.responses)),
    [operation.responses],
  );

  const [activeStatus, setActiveStatus] = useState<string>(
    () => responseEntries[0]?.[0] ?? "",
  );

  useEffect(() => {
    setActiveStatus(responseEntries[0]?.[0] ?? "");
  }, [responseEntries]);

  /* ---- Request code via @powerduck/openapi-codegen ---------------------- */
  const requestCode = useMemo(() => {
    if (!language || !client) {
      return "";
    }

    try {
      return generate({
        document,
        path: operation.path,
        method: operation.method,
        language,
        client,
        serverUrl,
      });
    } catch {
      return "";
    }
  }, [document, operation.path, operation.method, language, client, serverUrl]);

  const responseBody = useMemo(() => {
    const entry = responseEntries.find(([status]) => status === activeStatus);

    if (!entry) {
      return null;
    }

    const [, response] = entry;

    if (!response.content) {
      return null;
    }

    const mediaEntry = getPrimaryMediaType(response.content);

    const rawSchema = getProperty(mediaEntry?.[1], "schema");

    if (rawSchema === undefined) {
      return null;
    }

    return stringifyExample(buildExampleValue(rawSchema, document));
  }, [responseEntries, activeStatus, document]);

  return (
    <div className="pde-oas-code-stack">
      {/* Request card (dark) */}
      <div className="pde-oas-request-card">
        <div className="pde-oas-request-card-header">
          <div className="pde-oas-language-selectors">
            <Select.Root
              size="xs"
              collection={languageCollection}
              value={language ? [language] : []}
              onValueChange={(e) => handleLanguageChange(e.value[0] ?? "")}
            >
              <Select.Trigger aria-label="Code language">
                <Select.ValueText />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  <Select.List>
                    {languages.map((lang) => (
                      <Select.Item key={lang} item={lang}>
                        <Select.ItemText>{lang}</Select.ItemText>
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Content>
              </Select.Positioner>
            </Select.Root>

            <Select.Root
              size="xs"
              collection={clientCollection}
              value={client ? [client] : []}
              onValueChange={(e) => setClient(e.value[0] ?? "")}
            >
              <Select.Trigger aria-label="HTTP client">
                <Select.ValueText />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  <Select.List>
                    {availableClients.map((c) => (
                      <Select.Item key={c} item={c}>
                        <Select.ItemText>{c}</Select.ItemText>
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </div>

          <div className="pde-oas-request-card-actions">
            <CopyButton text={requestCode} variant={theme} />

            {onRequestClose ? (
              <button
                type="button"
                aria-label="Close code panel"
                className="pde-oas-code-icon-button"
                onClick={onRequestClose}
              >
                <IoMdClose />
              </button>
            ) : null}
          </div>
        </div>

        <div className="pde-oas-code-block-request">
          <ScrollArea.Root variant="hover" maxH="320px">
            <ScrollArea.Viewport>
              <HighlightedCode
                code={requestCode}
                language={mapLanguageToShikiLang(language)}
                theme={theme}
              />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>
      </div>

      {/* Response card (light) — always rendered so status tabs stay usable */}
      <div className="pde-oas-response-card">
        <div className="pde-oas-response-card-header">
          <span className="pde-oas-response-card-label">Response</span>

          <span className="pde-oas-response-status-tabs">
            {responseEntries.map(([status]) => (
              <button
                key={status}
                type="button"
                className={cn(
                  "pde-oas-response-status-tab",
                  status === activeStatus &&
                    "pde-oas-response-status-tab-active",
                )}
                onClick={() => setActiveStatus(status)}
              >
                <span
                  className={cn(
                    "pde-oas-response-status-dot",
                    getResponseStatusClass(status),
                  )}
                />
                {getResponseStatusLabel(status)}
              </button>
            ))}
          </span>
        </div>

        {responseBody ? (
          <div className="pde-oas-code-block-response">
            <ScrollArea.Root variant="hover" maxH="280px">
              <ScrollArea.Viewport>
                <HighlightedCode
                  code={responseBody}
                  language="json"
                  theme={theme}
                />
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            <CopyButton text={responseBody} variant={theme} />
          </div>
        ) : (
          <div className="pde-oas-code-block-response pde-oas-code-block-empty">
            <p className="pde-oas-empty-section-text">
              No response body defined
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Operation section (two-column: left docs, right sticky code)
   ========================================================================== */

type OperationSectionProps = {
  operation: OasOperation;
  document: OasRootDocument;
  serverUrl: string;
  languageGroups: Map<string, string[]>;
  theme: "light" | "dark";
  showCodeColumn: boolean;
};

const OperationSection = memo(function OperationSection({
  operation,
  document,
  serverUrl,
  languageGroups,
  theme,
  showCodeColumn,
}: OperationSectionProps) {
  return (
    <section
      id={`operation-${operation.id}`}
      data-op-section={operation.id}
      className="pde-oas-operation-section"
    >
      <div className="pde-oas-operation-column">
        {/* Title row */}
        <header className="pde-oas-operation-header">
          <div className="pde-oas-operation-endpoint">
            <OperationMethodLabel method={operation.method} />
            <code className="pde-oas-path-code">{operation.path}</code>

            {operation.deprecated ? (
              <span className="pde-oas-deprecated-badge">Deprecated</span>
            ) : null}
          </div>

          <h2 className="pde-oas-operation-title">
            {operation.summary || operation.operationId || operation.path}
          </h2>

          {operation.description ? (
            <Markdown className="pde-oas-operation-description">
              {operation.description}
            </Markdown>
          ) : null}

          {operation.tags.length > 0 ? (
            <div className="pde-oas-meta-tags">
              {operation.tags.map((tag) => (
                <span key={tag} className="pde-oas-tag-badge">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {operation.parameters.length > 0 ? (
          <section className="pde-oas-section">
            <SectionHeader
              title="Parameters"
              description="Parameters accepted by this endpoint."
              count={operation.parameters.length}
            />

            <div className="pde-oas-field-list">
              {operation.parameters.map((parameter) => (
                <ParameterRow
                  key={`${parameter.in}-${parameter.name}`}
                  parameter={parameter}
                  document={document}
                />
              ))}
            </div>
          </section>
        ) : null}

        <RequestBodySection operation={operation} document={document} />

        <ResponsesSection operation={operation} document={document} />
      </div>

      {showCodeColumn ? (
        <div className="pde-oas-code-column">
          <div className="pde-oas-code-sticky">
            <CodeExamplesPanel
              operation={operation}
              serverUrl={serverUrl}
              document={document}
              languageGroups={languageGroups}
              theme={theme}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
});

/* ==========================================================================
   Server selector
   ========================================================================== */

type ServerSelectorProps = {
  document: OasRootDocument;
  serverUrl: string;
  onChange: (value: string) => void;
};

const ServerSelector = memo(function ServerSelector({
  document,
  serverUrl,
  onChange,
}: ServerSelectorProps) {
  const servers = document.servers ?? [];

  if (servers.length === 0) {
    return null;
  }

  const serverUrls = servers.map((server) =>
    resolveServerUrl(server.url, server.variables),
  );

  const serverCollection = createListCollection({
    items: serverUrls,
  });

  return (
    <div className="pde-oas-server-selector">
      <span className="pde-oas-server-selector-label">Server</span>

      <Select.Root
        size="xs"
        collection={serverCollection}
        value={serverUrl ? [serverUrl] : []}
        onValueChange={(e) => onChange(e.value[0] ?? "")}
        className="pde-oas-server-select"
      >
        <Select.Trigger aria-label="Server URL">
          <Select.ValueText placeholder="Select server" />
        </Select.Trigger>
        <Select.Positioner>
          <Select.Content>
            <Select.List>
              {serverUrls.map((url) => (
                <Select.Item key={url} item={url}>
                  <Select.ItemText>{url}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Content>
        </Select.Positioner>
      </Select.Root>
    </div>
  );
});

/* ==========================================================================
   Header
   ========================================================================== */

type HeaderProps = {
  config?: OasDocumentHeaderConfig;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenNav: () => void;
  showNavButton: boolean;
};

function Header({
  config,
  theme,
  onToggleTheme,
  onOpenNav,
  showNavButton,
}: HeaderProps) {
  const title = config?.title ?? "API Documentation";
  const navItems = config?.navItems ?? [];
  const showThemeToggle = config?.showThemeToggle !== false;

  const renderNavItem = (item: OasDocumentNavItem, index: number) => {
    if (item.href) {
      return (
        <a
          key={index}
          href={item.href}
          className="pde-oas-nav-item"
          target="_blank"
          rel="noreferrer"
        >
          {item.label}
        </a>
      );
    }

    return (
      <button
        key={index}
        type="button"
        className="pde-oas-nav-item pde-oas-nav-item-button"
        onClick={item.onClick}
      >
        {item.label}
      </button>
    );
  };

  return (
    <header className="pde-oas-header">
      <div className="pde-oas-header-left">
        {showNavButton ? (
          <button
            type="button"
            aria-label="Open navigation"
            className="pde-oas-icon-button"
            onClick={onOpenNav}
          >
            <FiMenu />
          </button>
        ) : null}

        {config?.logo ? (
          typeof config.logo === "string" ? (
            <img src={config.logo} alt="" className="pde-oas-header-logo" />
          ) : (
            <span className="pde-oas-header-logo">{config.logo}</span>
          )
        ) : null}

        <span className="pde-oas-header-title">{title}</span>
      </div>

      <div className="pde-oas-header-right">
        {navItems.map(renderNavItem)}

        {showThemeToggle ? (
          <button
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="pde-oas-theme-toggle"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <LuSun size={16} /> : <LuMoon size={16} />}
          </button>
        ) : null}
      </div>
    </header>
  );
}

/* ==========================================================================
   Root
   ========================================================================== */

function OasDocumentImpl(
  {
    input,
    autoUpgrade = true,
    defaultOperationId,
    onOperationChange,
    className,
    style,
    theme: initialTheme = "light",
    header,
    showTree = true,
    treeWidth = 320,
  }: OasDocumentProps,
  ref: ForwardedRef<OasDocumentHandle>,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const treeRootRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<TreeHandle | null>(null);
  const codePanelRef = useRef<HTMLDivElement | null>(null);

  /** When true, scroll-spy must not fire (programmatic tree selection). */
  const suppressScrollSpyRef = useRef(false);

  const isTablet = useMediaQuery(
    `(max-width: ${TABLET_BREAKPOINT}px)`,
    false,
  );
  const isMobile = useMediaQuery(
    `(max-width: ${MOBILE_BREAKPOINT}px)`,
    false,
  );

  const [isNavOpen, setNavOpen] = useState(false);
  const [isCodeOpen, setCodeOpen] = useState(false);

  /* ---- Sidebar width: localStorage persistence ------------------------- */
  const STORAGE_KEY = "pde-oas-sidebar-width";

  const [resolvedTreeWidth, setResolvedTreeWidth] = useState(() => {
    if (treeWidth !== undefined) return treeWidth;
    if (typeof window === "undefined") return 340;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = Number.parseInt(stored, 10);
        if (parsed >= 200 && parsed <= 480) return parsed;
      }
    } catch {
      /* localStorage unavailable */
    }
    return 340;
  });

  const handleSplitterSizeChange = useCallback(
    (details: { size: number[] }) => {
      const first = details.size[0];
      if (first === undefined) return;
      const px = first;
      if (Number.isFinite(px) && px >= 200 && px <= 480) {
        setResolvedTreeWidth(px);
        try {
          window.localStorage.setItem(STORAGE_KEY, String(px));
        } catch {
          /* localStorage unavailable */
        }
      }
    },
    [],
  );

  const {
    document,
    loading,
    error,
    operations,
    tree,
    selectedOperation,
    setSelectedOperation,
    theme,
    setTheme,
  } = useOasDocument(input, {
    autoUpgrade,
    defaultOperationId,
    initialTheme,
  });

  /* ---- Generator options grouped by language (stable) ------------------- */
  const languageGroups = useMemo(() => getLanguageGroups(), []);

  /* ---- Server url state ------------------------------------------------- */
  const [selectedServerUrl, setSelectedServerUrl] = useState(() => {
    const server = document?.servers?.[0];

    return server ? resolveServerUrl(server.url, server.variables) : "";
  });

  useEffect(() => {
    const servers = document?.servers ?? [];

    if (servers.length === 0) {
      setSelectedServerUrl("");
      return;
    }

    const isValid = servers.some(
      (server) =>
        resolveServerUrl(server.url, server.variables) === selectedServerUrl,
    );

    if (!isValid) {
      setSelectedServerUrl(
        resolveServerUrl(servers[0].url, servers[0].variables),
      );
    }
  }, [document, selectedServerUrl]);

  /* ---- Operation -> tree node index (for scroll-spy locateNode) --------- */
  const operationTreeIndex = useMemo(
    () => buildOperationTreeIndex(tree, operations),
    [tree, operations],
  );

  /* ---- Content sections ordered to match the left-hand tree ------------- */
  const orderedOperations = useMemo(
    () => buildOrderedOperations(tree, operations),
    [tree, operations],
  );

  /* ---- Selection handling (user-initiated) ------------------------------ */
  const handleOperationChange = useCallback(
    (operation: OasOperation) => {
      suppressScrollSpyRef.current = true;
      setSelectedOperation(operation.id);
      onOperationChange?.(operation);

      if (isTablet) {
        setNavOpen(false);
      }

      // Release the suppression flag on the next frame.
      window.requestAnimationFrame(() => {
        suppressScrollSpyRef.current = false;
      });
    },
    [isTablet, onOperationChange, setSelectedOperation],
  );

  const handleTreeSelect = useCallback(
    (node: TreeNode) => {
      const metadata = node.metadata as { kind?: string } | undefined;

      if (metadata?.kind !== "operation") {
        return;
      }

      const operation = resolveOperationFromNode(operations, node);

      if (operation) {
        handleOperationChange(operation);

        // Scroll the corresponding content section into view.
        const contentEl = window.document.getElementById(
          `operation-${operation.id}`,
        );

        contentEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [operations, handleOperationChange],
  );

  /* ---- Scroll-spy: IntersectionObserver on operation sections ------------ */
  useEffect(() => {
    const container = contentRef.current;

    if (!container || operations.length === 0) {
      return;
    }

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("[data-op-section]"),
    );

    if (sections.length === 0) {
      return;
    }

    let ticking = false;
    let rafId = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (ticking) {
          return;
        }

        ticking = true;
        rafId = window.requestAnimationFrame(() => {
          ticking = false;

          if (suppressScrollSpyRef.current) {
            return;
          }

          // With rootMargin "-45% 0px -50% 0px" and threshold 0, each entry
          // represents a section crossing the thin ~5% trigger band at ~45%
          // from the viewport top. Only one section should be intersecting
          // at a time; pick the entry whose target is currently intersecting.
          const active = entries.find((e) => e.isIntersecting);

          if (!active) {
            return;
          }

          const target = active.target as HTMLElement;
          const operationId = target.dataset.opSection;

          if (!operationId) {
            return;
          }

          // Only update if the active operation actually changed.
          if (selectedOperation?.id === operationId) {
            return;
          }

          const treeNodeId = operationTreeIndex.get(operationId);

          if (treeNodeId) {
            treeRef.current?.locateNode(
              (node: TreeNode) => node.id === treeNodeId,
            );
          }

          const op = operations.find((o) => o.id === operationId);

          if (op) {
            setSelectedOperation(operationId);
          }
        });
      },
      {
        root: container,
        rootMargin: "-45% 0px -50% 0px",
        threshold: 0,
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [operations, operationTreeIndex, setSelectedOperation, selectedOperation?.id]);

  /* ---- Imperative handle ------------------------------------------------ */
  useImperativeHandle(
    ref,
    (): OasDocumentHandle => ({
      getRootElement: () => rootRef.current,
      getOperations: () => operations,
      getSelectedOperation: () => selectedOperation,
      selectOperation: (operationId: string) => {
        const target = operations.find(
          (operation) =>
            operation.id === operationId ||
            operation.operationId === operationId,
        );

        if (!target) {
          return false;
        }

        handleOperationChange(target);

        const contentEl = window.document.getElementById(
          `operation-${target.id}`,
        );

        contentEl?.scrollIntoView({ behavior: "smooth", block: "start" });

        return true;
      },
      scrollToOperation: (operationId?: string) => {
        const targetId = operationId ?? selectedOperation?.id;

        if (targetId) {
          const contentEl = window.document.getElementById(
            `operation-${targetId}`,
          );

          contentEl?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }
      },
      focusSearch: () => {
        const search = treeRootRef.current?.querySelector<HTMLInputElement>(
          'input[type="search"], input',
        );

        search?.focus();
      },
    }),
    [operations, selectedOperation, handleOperationChange],
  );

  /* ---- Theme toggle (hook must be before any early return) -------------- */
  const handleToggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  /* ---- Root class ------------------------------------------------------ */
  const rootClassName = cn(
    "pde-oas-root",
    !showTree && "pde-oas-root-no-tree",
    isTablet && "pde-oas-root-tablet",
    isMobile && "pde-oas-root-mobile",
    className,
  );

  /* ---- Loading --------------------------------------------------------- */
  if (loading) {
    return (
      <div
        ref={rootRef}
        className={rootClassName}
        style={style}
        data-theme={theme}
      >
        <LoadingState />
      </div>
    );
  }

  /* ---- Error ----------------------------------------------------------- */
  if (error || !document) {
    return (
      <div
        ref={rootRef}
        className={rootClassName}
        style={style}
        data-theme={theme}
      >
        {error ? (
          <ErrorState error={error} />
        ) : (
          <EmptyState
            title="No API document"
            description="No OpenAPI document was provided."
          />
        )}
      </div>
    );
  }

  /* ---- Empty ----------------------------------------------------------- */
  if (operations.length === 0) {
    return (
      <div
        ref={rootRef}
        className={rootClassName}
        style={style}
        data-theme={theme}
      >
        <EmptyState
          title="No API operations"
          description="The OpenAPI document does not contain any usable path operations."
        />
      </div>
    );
  }

  const version = document.info?.version;
  const showCodeColumn = !isTablet;

  /* ---- Sidebar ---------------------------------------------------------- */
  const sidebar = (
    <aside className="pde-oas-sidebar">
      <div className="pde-oas-sidebar-header">
        <span className="pde-oas-sidebar-eyebrow">API Reference</span>
        {version ? (
          <span className="pde-oas-version-badge">v{version}</span>
        ) : null}
      </div>

      <div className="pde-oas-sidebar-tree" ref={treeRootRef}>
        <Tree
          ref={treeRef}
          nodes={tree}
          onSelect={handleTreeSelect}
          variant="doc"
          searchable
          searchPlaceholder="Find anything"
          defaultExpandDepth={2}
          size="sm"
          className="pde-oas-nav-tree"
        />
      </div>

      <div className="pde-oas-sidebar-footer">
        <ServerSelector
          document={document}
          serverUrl={selectedServerUrl}
          onChange={setSelectedServerUrl}
        />
      </div>
    </aside>
  );

  /* ---- Content ---------------------------------------------------------- */
  const content = (
    <div className="pde-oas-content" ref={contentRef}>
      <div className="pde-oas-document-intro">
        <h1 className="pde-oas-document-title">
          {document.info?.title || "API Documentation"}
        </h1>

        {document.info?.description ? (
          <Markdown className="pde-oas-document-description">
            {document.info.description}
          </Markdown>
        ) : null}
      </div>

      {orderedOperations.map((operation) => (
        <OperationSection
          key={operation.id}
          operation={operation}
          document={document}
          serverUrl={selectedServerUrl}
          languageGroups={languageGroups}
          theme={theme}
          showCodeColumn={showCodeColumn}
        />
      ))}
    </div>
  );

  /* ---- Desktop layout --------------------------------------------------- */

  return (
      <div
        ref={rootRef}
        className={rootClassName}
        style={{
          ...style,
          ["--sidebar-width" as string]: `${resolvedTreeWidth}px`,
        }}
        data-theme={theme}
      >
      <Header
        config={header}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenNav={() => setNavOpen(true)}
        showNavButton={isTablet}
      />

      {/* Tablet: nav overlay */}
      {isTablet && showTree ? (
        <>
          <div
            className={cn(
              "pde-oas-overlay-backdrop",
              isNavOpen && "pde-oas-overlay-backdrop-visible",
            )}
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              "pde-oas-nav-overlay-panel",
              isNavOpen && "pde-oas-overlay-panel-open",
            )}
          >
            {sidebar}
          </div>

          <div
            className={cn(
              "pde-oas-overlay-backdrop",
              isCodeOpen && "pde-oas-overlay-backdrop-visible",
            )}
            onClick={() => setCodeOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={codePanelRef}
            className={cn(
              "pde-oas-code-overlay-panel",
              isCodeOpen && "pde-oas-overlay-panel-open",
            )}
          >
            {selectedOperation ? (
              <CodeExamplesPanel
                operation={selectedOperation}
                serverUrl={selectedServerUrl}
                document={document}
                languageGroups={languageGroups}
                theme={theme}
                onRequestClose={() => setCodeOpen(false)}
              />
            ) : null}
          </div>
        </>
      ) : null}

      {/* Main workspace */}
      {showTree && !isTablet ? (
        <Splitter.Root
          orientation="horizontal"
          defaultSize={[`${resolvedTreeWidth}px`]}
          onResizeEnd={handleSplitterSizeChange}
          panels={[
            { id: "pde-oas-sidebar", minSize: "200px", maxSize: "480px" },
            { id: "pde-oas-content" },
          ]}
          className="pde-oas-splitter"
        >
          <Splitter.Panel id="pde-oas-sidebar" className="pde-oas-splitter-sidebar">
            {sidebar}
          </Splitter.Panel>

          <Splitter.ResizeTrigger
            id="pde-oas-sidebar:pde-oas-content"
            className="pde-oas-splitter-trigger"
          >
            <Splitter.ResizeTriggerSeparator className="pde-oas-splitter-separator" />
          </Splitter.ResizeTrigger>

          <Splitter.Panel id="pde-oas-content" className="pde-oas-splitter-content">
            <div className="pde-oas-main-region">
              {content}
            </div>
          </Splitter.Panel>
        </Splitter.Root>
      ) : (
        <div className="pde-oas-workspace">
          <div className="pde-oas-main-region">
            {isTablet ? (
              <div className="pde-oas-content-mobile-bar">
                <button
                  type="button"
                  className="pde-oas-view-code-button"
                  onClick={() => setCodeOpen(true)}
                  disabled={!selectedOperation}
                >
                  <IoMdCode />
                  Code
                </button>
              </div>
            ) : null}

            {content}
          </div>
        </div>
      )}
      </div>
  );
}

const OasDocumentInner = forwardRef(OasDocumentImpl);

const OasDocument = forwardRef<OasDocumentHandle, OasDocumentProps>(
  function OasDocument(props, ref) {
    return (
      <OptionalChakraProvider>
        <OasDocumentInner ref={ref} {...props} />
      </OptionalChakraProvider>
    );
  },
);

export default OasDocument;
