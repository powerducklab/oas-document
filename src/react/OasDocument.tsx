import "@powerduck/tree/react/index.css";
import "@powerduck/md-editor/dist/style.css";
import "./OasDocument.css";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ForwardedRef } from "react";

import { renderMarkdown, type RendererOptions } from "@powerduck/md-editor";

import { generate, list, registerBuiltins } from "@powerduck/openapi-codegen";

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
  Splitter,
} from "@chakra-ui/react";

import { HighlightedCode } from "./components/HighlightedCode";
import { DeferredContent } from "./components/DeferredContent";
import { buildExampleValue, getDirectFields, resolveSchemaRef, stringifyExample, type SchemaField } from "./libs/schema-display";
import { CodePreferencesProvider, useCodePreferences } from "./components/CodePreferences";
import { ReferenceSelect } from "./components/ReferenceSelect";
import { LanguageIcon, languageLabel, clientLabel } from "./components/LanguageIcon";
import { Drawer } from "./components/Drawer";

import { Tree } from "@powerduck/tree/react";

import type { TreeHandle } from "@powerduck/tree/react";
import type { TreeNode } from "@powerduck/tree";

import { FiCopy, FiMenu } from "react-icons/fi";
import { AiOutlineMinusCircle, AiOutlinePlusCircle } from "react-icons/ai";
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
  createOperationResolver,
  safeNavigationHref,
  useMediaQuery,
} from "./libs/utils";

import { OptionalChakraProvider } from "./libs/OptionalChakraProvider";

/* ==========================================================================
   Code generator setup (module-level, idempotent)
   ========================================================================== */

registerBuiltins();

const MARKDOWN_RENDER_OPTIONS: RendererOptions = {
  html: false,
  codeHighlight: true,
  tips: true,
  math: false,
  mindmap: false,
};

/* ==========================================================================
   Shiki highlighter adapter (module-level, lazy async load)
   ========================================================================== */

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
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);

  const handleClick = useCallback(async () => {
    const ok = await copyToClipboard(text);

    if (!mounted.current) return;
    clearTimeout(timer.current);
    setCopied(ok);
    setFailed(!ok);
    timer.current = setTimeout(() => { setCopied(false); setFailed(false); }, 1600);
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
      disabled={!text}
      title={copied ? "Copied" : failed ? "Copy failed. Try again." : "Copy code"}
      aria-label={copied ? "Copied" : failed ? "Copy failed. Try again." : "Copy code"}
    >
      <FiCopy size={14} />
      <span className="pde-oas-sr-only" role="status">{copied ? "Copied to clipboard" : failed ? "Could not copy to clipboard" : ""}</span>
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
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(async () => {
    const ok = await copyToClipboard(name);
    if (!mounted.current) return;

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
  depth?: number;
};

function CompositeSchemaTabs({
  alternatives,
  document,
  kind,
  depth = 0,
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
              aria-pressed={index === safeIndex}
              onClick={() => setActiveIndex(index)}
            >
              {alt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pde-oas-composite-tabs-content">
        {active ? (
          <SchemaBlock schema={active.schema} document={document} depth={depth + 1} />
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
function getSchemaConstraintLabel(schema: OpenApiSchema | undefined): string {
  if (!schema) return "";

  const record = schema as Record<string, unknown>;
  const parts: string[] = [];

  // Numeric range — OAS 3.0 uses booleans for exclusive, 3.1 uses numbers.
  const minimum =
    typeof record.minimum === "number" ? record.minimum : undefined;
  const maximum =
    typeof record.maximum === "number" ? record.maximum : undefined;
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
  const minLen =
    typeof record.minLength === "number" ? record.minLength : undefined;
  const maxLen =
    typeof record.maxLength === "number" ? record.maxLength : undefined;
  if (minLen !== undefined || maxLen !== undefined) {
    parts.push(`[${minLen ?? ""}, ${maxLen ?? ""}]`);
  }

  // Array items
  const minItems =
    typeof record.minItems === "number" ? record.minItems : undefined;
  const maxItems =
    typeof record.maxItems === "number" ? record.maxItems : undefined;
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
        <span className="pde-oas-field-type">{getSchemaTypeLabel(schema)}</span>
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

      {compositeAlternatives.length > 0 &&
      compositeKind &&
      compositeKind !== "allOf" ? (
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
  depth?: number;
};

function SchemaBlock({ schema, document, depth = 0 }: SchemaBlockProps) {
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

  if (depth >= 12) return <p className="pde-oas-empty-section-text">Schema nesting limit reached.</p>;

  if (!resolved) {
    return (
      <p className="pde-oas-empty-section-text">
        This schema could not be resolved.
      </p>
    );
  }

  if (
    compositeKind &&
    compositeKind !== "allOf" &&
    compositeAlternatives.length > 0
  ) {
    return (
      <CompositeSchemaTabs
        alternatives={compositeAlternatives}
        document={document}
        kind={compositeKind}
        depth={depth}
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
        <SchemaFieldRow key={field.path} field={field} document={document} />
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
    rawSchema !== undefined ? resolveSchemaRef(rawSchema, document) : undefined;

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
                  <p className="pde-oas-empty-section-text">
                    No response body.
                  </p>
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

  const { selection, setSelection } = useCodePreferences();
  const language = languageGroups.has(selection.language) ? selection.language : (languages[0] ?? "shell");
  const availableClients = languageGroups.get(language) ?? [];
  const client = availableClients.includes(selection.client) ? selection.client : (availableClients[0] ?? "");

  const languageOptions = useMemo(() => languages.map((value) => ({ value, label: languageLabel(value), icon: <LanguageIcon language={value} /> })), [languages]);
  const clientOptions = useMemo(() => availableClients.map((value) => ({ value, label: clientLabel(value) })), [availableClients]);

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      const clients = languageGroups.get(nextLanguage) ?? [];
      setSelection({ language: nextLanguage, client: clients[0] ?? "" });
    },
    [languageGroups, setSelection],
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

    const media = mediaEntry?.[1];
    const explicit = getProperty(media, "example");
    if (explicit !== undefined) return stringifyExample(explicit);
    const examples = getObjectProperty(media, "examples");
    if (examples) {
      for (const entry of Object.values(examples)) {
        const value = getProperty(entry, "value");
        if (value !== undefined) return stringifyExample(value);
      }
    }
    const rawSchema = getProperty(media, "schema");

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
            <ReferenceSelect label="Code language" variant="language" theme={theme}
              value={language} options={languageOptions} onChange={handleLanguageChange} />
            <ReferenceSelect label="HTTP client" theme={theme}
              value={client} options={clientOptions} onChange={(next) => setSelection({ language, client: next })} />
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
          <div className="pde-oas-code-scroll" role="region" aria-label="Code sample" tabIndex={0}>
              <HighlightedCode
                code={requestCode}
                language={mapLanguageToShikiLang(language)}
                theme={theme}
              />
            </div>
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
                aria-pressed={status === activeStatus}
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

        {responseBody !== null ? (
          <div className="pde-oas-code-block-response">
            <div className="pde-oas-code-scroll" role="region" aria-label="Code sample" tabIndex={0}>
                <HighlightedCode
                  code={responseBody}
                  language="json"
                  theme={theme}
                />
              </div>
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
  instanceId: string;
};

const OperationSection = memo(function OperationSection({
  operation,
  document,
  serverUrl,
  languageGroups,
  theme,
  showCodeColumn,
  instanceId,
}: OperationSectionProps) {
  return (
    <section
      id={`${instanceId}-operation-${operation.id}`}
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
            <DeferredContent>
            <CodeExamplesPanel
              operation={operation}
              serverUrl={serverUrl}
              document={document}
              languageGroups={languageGroups}
              theme={theme}
            />
            </DeferredContent>
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
  theme: "light" | "dark";
  document: OasRootDocument;
  serverUrl: string;
  onChange: (value: string) => void;
};

const ServerSelector = memo(function ServerSelector({
  theme,
  document,
  serverUrl,
  onChange,
}: ServerSelectorProps) {
  const serverOptions = useMemo(() => {
    const urls = new Set((document.servers ?? []).map((server) => resolveServerUrl(server.url, server.variables)));
    return Array.from(urls, (value) => ({ value, label: value }));
  }, [document.servers]);
  if (!serverOptions.length) return null;

  return (
    <div className="pde-oas-server-selector">
      <span className="pde-oas-server-selector-label">Server</span>

      <ReferenceSelect label="Server URL" variant="server" theme={theme}
        value={serverUrl} options={serverOptions} onChange={onChange} />
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
          href={safeNavigationHref(item.href)}
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
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
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
    treeWidth,
  }: OasDocumentProps,
  ref: ForwardedRef<OasDocumentHandle>,
) {
  const instanceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const treeRootRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<TreeHandle | null>(null);
  const selectedIdRef = useRef<string | undefined>(undefined);
  const releaseScrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(releaseScrollTimer.current), []);

  /** When true, scroll-spy must not fire (programmatic tree selection). */
  const suppressScrollSpyRef = useRef(false);

  const isTablet = useMediaQuery(`(max-width: ${TABLET_BREAKPOINT}px)`, false);
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`, false);

  const [isNavOpen, setNavOpen] = useState(false);
  const [isCodeOpen, setCodeOpen] = useState(false);

  /* ---- Sidebar width: localStorage persistence ------------------------- */
  const STORAGE_KEY = "pde-oas-sidebar-width";

  const [resolvedTreeWidth, setResolvedTreeWidth] = useState(() =>
    treeWidth !== undefined && Number.isFinite(treeWidth)
      ? Math.min(480, Math.max(200, treeWidth))
      : 280,
  );

  const handleSplitterSizeChange = useCallback(
    (details: { size: number[] }) => {
      const first = details.size[0];
      if (first === undefined) return;
      const px = (first / 100) * (rootRef.current?.clientWidth ?? 0);
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

  selectedIdRef.current = selectedOperation?.id;
  const resolveNode = useMemo(() => createOperationResolver(operations), [operations]);
  useEffect(() => {
    if (treeWidth !== undefined && Number.isFinite(treeWidth)) {
      setResolvedTreeWidth(Math.min(480, Math.max(200, treeWidth)));
      return;
    }
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      setResolvedTreeWidth(stored >= 200 && stored <= 480 ? stored : 280);
    } catch { setResolvedTreeWidth(280); }
  }, [treeWidth]);

  const scrollToSection = useCallback((id: string) => {
    const section = Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[data-op-section]") ?? [])
      .find((element) => element.dataset.opSection === id);
    section?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, []);

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

      clearTimeout(releaseScrollTimer.current);
      releaseScrollTimer.current = setTimeout(() => {
        suppressScrollSpyRef.current = false;
      }, 700);
    },
    [isTablet, onOperationChange, setSelectedOperation],
  );

  const handleTreeSelect = useCallback(
    (node: TreeNode) => {
      const metadata = node.metadata as { kind?: string } | undefined;

      if (metadata?.kind !== "operation") {
        return;
      }

      const operation = resolveNode(node);

      if (operation) {
        handleOperationChange(operation);

        scrollToSection(operation.id);
      }
    },
    [resolveNode, handleOperationChange, scrollToSection],
  );

  /* ---- Scroll-spy: one passive listener and logarithmic section lookup ---- */
  useEffect(() => {
    const container = contentRef.current;
    if (!container || loading || operations.length === 0) return;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-op-section]"));
    if (!sections.length) return;
    let rafId = 0;
    const update = () => {
      rafId = 0;
      if (suppressScrollSpyRef.current) return;
      // Include the reading pane's padding and the section's scroll margin.
      const readingEdge = container.getBoundingClientRect().top + 64;
      let low = 0;
      let high = sections.length - 1;
      let activeIndex = 0;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        if (sections[middle].getBoundingClientRect().top <= readingEdge) {
          activeIndex = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      const operationId = sections[activeIndex].dataset.opSection;
      if (!operationId || selectedIdRef.current === operationId) return;
      selectedIdRef.current = operationId;
      setSelectedOperation(operationId);
      const nodeId = operationTreeIndex.get(operationId);
      if (nodeId) treeRef.current?.locateNode((node: TreeNode) => node.id === nodeId);
    };
    const schedule = () => { if (!rafId) rafId = window.requestAnimationFrame(update); };
    const onScrollEnd = () => {
      clearTimeout(releaseScrollTimer.current);
      suppressScrollSpyRef.current = false;
      schedule();
    };
    container.addEventListener("scroll", schedule, { passive: true });
    container.addEventListener("scrollend", onScrollEnd);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(container);
    return () => {
      container.removeEventListener("scroll", schedule);
      container.removeEventListener("scrollend", onScrollEnd);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [operations, operationTreeIndex, setSelectedOperation, loading, isTablet, showTree]);

  /* ---- Imperative handle ------------------------------------------------ */
  useImperativeHandle(
    ref,
    (): OasDocumentHandle => ({
      getRootElement: () => rootRef.current,
      getOperations: () => orderedOperations,
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

        scrollToSection(target.id);

        return true;
      },
      scrollToOperation: (operationId?: string) => {
        const targetId = operationId ?? selectedOperation?.id;

        if (targetId) {
          const operation = operations.find((item) => item.id === targetId || item.operationId === targetId);
          if (operation) scrollToSection(operation.id);
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
    [operations, orderedOperations, selectedOperation, handleOperationChange, scrollToSection],
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
    <aside className="pde-oas-sidebar" aria-label="API navigation">
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
          theme={theme}
          document={document}
          serverUrl={selectedServerUrl}
          onChange={setSelectedServerUrl}
        />
      </div>
    </aside>
  );

  /* ---- Content ---------------------------------------------------------- */
  const content = (
    <div className="pde-oas-content" ref={contentRef} role="region" aria-label="API reference" tabIndex={0}>
      <div className="pde-oas-document-intro">
        <div className="pde-oas-intro-eyebrow">API REFERENCE <span>{operations.length} endpoints</span></div>
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
          instanceId={instanceId}
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
        showNavButton={isTablet && showTree}
      />

      {isTablet ? <>
        {showTree ? <Drawer open={isNavOpen} onClose={() => setNavOpen(false)} label="Navigation" side="left">{sidebar}</Drawer> : null}
        <Drawer open={isCodeOpen} onClose={() => setCodeOpen(false)} label="Code examples" side="right">
          {selectedOperation ? <CodeExamplesPanel
            operation={selectedOperation} serverUrl={selectedServerUrl}
            document={document} languageGroups={languageGroups} theme={theme}
          /> : null}
        </Drawer>
      </> : null}

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
          <Splitter.Panel
            id="pde-oas-sidebar"
            className="pde-oas-splitter-sidebar"
          >
            {sidebar}
          </Splitter.Panel>

          <Splitter.ResizeTrigger
            id="pde-oas-sidebar:pde-oas-content"
            className="pde-oas-splitter-trigger"
          >
            <Splitter.ResizeTriggerSeparator className="pde-oas-splitter-separator" />
          </Splitter.ResizeTrigger>

          <Splitter.Panel
            id="pde-oas-content"
            className="pde-oas-splitter-content"
          >
            <div className="pde-oas-main-region">{content}</div>
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
        <CodePreferencesProvider>
          <OasDocumentInner ref={ref} {...props} />
        </CodePreferencesProvider>
      </OptionalChakraProvider>
    );
  },
);

export default OasDocument;
