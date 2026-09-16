# @powerduck/oas-document

Production-grade OpenAPI documentation component for React. Pass an OAS document and get a full Stripe-style API documentation UI with header navigation, light/dark themes, tree navigation, scroll-spy, schema exploration, and multi-language code examples.

Built on [`@powerduck/openapi-parser`](https://www.npmjs.com/package/@powerduck/openapi-parser) (validation + auto-upgrade), [`@powerduck/tree`](https://www.npmjs.com/package/@powerduck/tree) (navigation), [`@powerduck/md-editor`](https://www.npmjs.com/package/@powerduck/md-editor) (Markdown rendering), and [`@powerduck/openapi-codegen`](https://www.npmjs.com/package/@powerduck/openapi-codegen) (request code generation).

[https://www.powerduck.com](https://www.powerduck.com)

## Features

- **Drop-in API documentation** — accepts a parsed object, JSON string, or YAML string (Swagger 2.0 / OpenAPI 3.x)
- **Stripe-style layout** — configurable header (logo, title, nav links, theme toggle), sidebar tree, two-column operation view with sticky code panel
- **Light / dark themes** — toggle in the header; selection persists to `localStorage`
- **Auto-upgrade to OAS 3.2** — validates and upgrades via `@powerduck/openapi-parser` (toggleable, default on)
- **Scroll-spy navigation** — passive scroll listener with binary search over section positions; auto-locates operations in the tree
- **Markdown rendering** — descriptions and field docs rendered via `@powerduck/md-editor` with highlight.js code highlighting and admonition blocks
- **Multi-language code examples** — generated via `@powerduck/openapi-codegen` (cURL, JS/fetch, JS/axios, Python/requests, Go, Rust, and more), with response preview
- **AI-ready Markdown** — per-operation Copy for LLM and View as Markdown actions include the operation description, selected client request, and primary response example or structure
- **Schema exploration** — nested property tables with expand/collapse, type labels, required indicators, constraint badges (enum, min/max, pattern, format), and oneOf/anyOf rendered as switchable tabs
- **Server selector** — automatic server URL switcher with variable resolution
- **Responsive** — sidebar collapses to overlay on tablet/mobile; code panel moves to slide-out drawer
- **Type-safe** — full TypeScript types, zero `any` in public API
- **Robust** — null-safe, circular reference detection, LRU-cached syntax highlighting, deferred code rendering

## Installation

```bash
npm install @powerduck/oas-document
```

Peer dependency:

```bash
npm install react react-dom
```

> The component bundles its own stylesheet (tree CSS, md-editor CSS) — no extra CSS imports needed beyond the package entry.

## Quick Start

```tsx
import { OasDocument } from "@powerduck/oas-document/react";
import "@powerduck/oas-document/react/index.css";

const spec = {
  openapi: "3.1.0",
  info: { title: "My API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        summary: "List users",
        operationId: "listUsers",
        tags: ["Users"],
        responses: { "200": { description: "A list of users" } },
      },
    },
  },
};

export default function App() {
  return <OasDocument input={spec} style={{ height: "100vh" }} />;
}
```

## With Header Configuration

```tsx
<OasDocument
  input={spec}
  header={{
    logo: "https://example.com/logo.svg",
    title: "My API Docs",
    navItems: [
      { label: "Home", href: "/" },
      { label: "GitHub", href: "https://github.com/org/repo" },
      { label: "Contact", onClick: () => openContact() },
    ],
    showThemeToggle: true,
  }}
  treeWidth={340}
/>
```

## Using the Hook Directly

```tsx
import { useOasDocument } from "@powerduck/oas-document/react";

function MyDocs({ spec }: { spec: unknown }) {
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
  } = useOasDocument(spec, { autoUpgrade: true });

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        Toggle theme
      </button>
      <pre>{JSON.stringify(document?.info, null, 2)}</pre>
    </div>
  );
}
```

## Core-Only (No React)

```ts
import { loadOasDocument, parseOperations, buildNavigationGroups } from "@powerduck/oas-document";

const result = await loadOasDocument(spec, { autoUpgrade: true });

if (result.error) {
  console.error("Failed to load:", result.error);
} else {
  console.log("Operations:", result.operations.length);
  console.log("Navigation groups:", result.navigationGroups);
  console.log("Tree nodes:", result.tree.length);
}
```

### Export an operation as Markdown

```ts
import { buildOperationMarkdown, parseOperations } from "@powerduck/oas-document/core";

const operation = parseOperations(document)[0];
if (operation) {
  const markdown = buildOperationMarkdown(document, operation);
}
```

The UI generates Markdown only when an export action is used. Both actions use the same content. The export prefers explicit response examples and falls back to the primary response schema. Other response statuses are summarized, without exporting the whole specification or a reference appendix. An optional third argument selects the server URL, and a fourth argument accepts `{ language, client }` (defaults to shell/cURL). The UI follows the selected code example language. The Markdown preview supports text selection, copying, and Escape to close.

## API Reference

### `<OasDocument />`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `input` | `OpenApiInput \| OpenApiDocument \| null` | — **required** | The OpenAPI/Swagger document. Accepts a parsed object, JSON string, or YAML string. |
| `autoUpgrade` | `boolean` | `true` | Validate and upgrade to OAS 3.2 via `@powerduck/openapi-parser`. |
| `defaultOperationId` | `string` | — | The operation ID to select on initial render. |
| `onOperationChange` | `(operation: OasOperation) => void` | — | Callback fired on user-initiated selection changes (tree click, imperative call). Scroll-spy changes do not fire it. |
| `className` | `string` | — | Additional CSS class for the root element. |
| `style` | `React.CSSProperties` | — | Inline styles for the root element. |
| `theme` | `"light" \| "dark"` | `"light"` | Initial color theme. The selected theme persists to `localStorage` (key: `pde-oas-theme`). |
| `header` | `OasDocumentHeaderConfig` | — | Header configuration (logo, title, nav items, theme toggle). |
| `showTree` | `boolean` | `true` | Whether to show the sidebar tree. |
| `treeWidth` | `number` | `340` | Sidebar width in pixels. When omitted, width is restored from `localStorage` (key: `pde-oas-sidebar-width`); manual drag-resize saves automatically. Range: 240–480. |

### `OasDocumentHeaderConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `logo` | `string \| ReactNode` | — | Logo image URL or custom node (rendered at 24px height). |
| `title` | `string` | `"API Documentation"` | Header title. |
| `navItems` | `Array<{ label, href?, onClick? }>` | `[]` | Horizontal navigation links. `href` renders an anchor; `onClick` renders a button. |
| `showThemeToggle` | `boolean` | `true` | Whether to show the light/dark toggle button. |

### `useOasDocument(input, options?)`

```ts
interface UseOasDocumentOptions {
  autoUpgrade?: boolean;        // default true
  defaultOperationId?: string;
  initialTheme?: "light" | "dark"; // default "light", overrides localStorage
}

interface UseOasDocumentResult {
  document: Oas32Document | null;
  loading: boolean;
  error: Error | null;
  operations: OasOperation[];
  navigationGroups: OasNavigationGroup[];
  tree: TreeNode[];
  warnings: string[];
  selectedOperation: OasOperation | undefined;
  setSelectedOperation: (id: string | undefined) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}
```

> Theme selection is automatically persisted to `localStorage`. Passing `initialTheme` overrides the stored value on first mount only.

### `OasDocumentHandle` (via `ref`)

| Method | Description |
|--------|-------------|
| `getRootElement()` | Returns the root DOM node. |
| `getOperations()` | Returns all operations. |
| `getSelectedOperation()` | Returns the currently selected operation. |
| `selectOperation(id)` | Selects an operation by id or operationId. Returns `false` if not found. |
| `scrollToOperation(id?)` | Smooth-scrolls to an operation section. |
| `focusSearch()` | Focuses the tree search input. |

## Styling

Import the stylesheet:

```ts
import "@powerduck/oas-document/react/index.css";
```

The root element receives `data-theme="light"` or `data-theme="dark"`. All colors resolve through CSS variables under `.pde-oas-root`. Override both the root and portalled scopes so custom colors remain consistent across dropdowns and menus:

```css
:is(.pde-oas-root, .pde-oas-theme) {
  --pde-color-accent: #635bff;
}

:is(.pde-oas-root, .pde-oas-theme)[data-theme="dark"] {
  --pde-color-accent: #a5a0ff;
}
```

The React entry requires a bundler that handles CSS imports. Use the core entry for direct Node.js execution.

## Auto-Upgrade

By default, `autoUpgrade` is `true`. The input is validated and upgraded to OpenAPI 3.2 via `@powerduck/openapi-parser`. Disable it when you already have a valid OAS 3.2 document:

```tsx
<OasDocument input={validOas32Doc} autoUpgrade={false} />
```

## Performance

- **Deferred code rendering** — code examples are generated only when they come within 600px of the viewport (IntersectionObserver)
- **Shiki LRU cache** — syntax highlighting cache limited to 64 entries / 1MB; grammars load on demand; code over 50KB renders as plain text
- **Scroll-spy** — passive scroll listener with rAF throttling and binary search (O(log n)) over section positions
- **Example generation budget** — bounded to 6 nesting levels and 1,000-node traversal budget; explicit examples take precedence
- **No full-page virtualization** — layout cost scales with document complexity; for very large APIs, consider paginating or using the core entry to build a custom shell

Treat input objects as immutable and pass a new object when the document changes.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsup
npm run check       # English source check, types, tests, and build
npm run preview     # Local responsive UI preview
npm run benchmark   # Navigation lookup benchmark
```

## Links

- [Official Website](https://www.powerduck.com/opensource/oas-document.html)
- [Documentation](https://www.powerduck.com/docs/oas-document/introduction/)
- [Live Demo](https://www.powerduck.com/demo/oas-document)
- [GitHub](https://github.com/powerducklab/oas-document)
- [npm](https://www.npmjs.com/package/@powerduck/oas-document)

## License

MIT © [powerduck](https://www.powerduck.com)
