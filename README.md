# @powerduck/oas-document

Production-grade OpenAPI documentation component for React. Pass an OAS document and get a full Stripe-style API documentation UI with header navigation, light/dark themes, tree navigation, scroll-spy, schema exploration, and multi-language code examples.

Built on top of [`@powerduck/openapi-parser`](https://www.npmjs.com/package/@powerduck/openapi-parser) for validation and upgrade, [`@powerduck/tree`](https://www.npmjs.com/package/@powerduck/tree) for navigation, [`@powerduck/md-editor`](https://www.npmjs.com/package/@powerduck/md-editor) for Markdown rendering, and [`@powerduck/openapi-codegen`](https://www.npmjs.com/package/@powerduck/openapi-codegen) for request code generation.

[https://www.powerduck.com](https://www.powerduck.com)

## Features

- **Drop-in API documentation** — pass any Swagger 2.0 / OpenAPI 3.x document (object, JSON string, or YAML string)
- **Stripe-style layout** — configurable header (logo, title, nav links, theme toggle), sidebar tree, two-column operation view with sticky code panel
- **Light / dark themes** — toggle in the header, all colors resolve through CSS variables
- **Auto-upgrade to OAS 3.2** — validates and upgrades via `@powerduck/openapi-parser` (toggleable, default on)
- **Scroll-spy navigation** — passive scroll listener with binary search over section positions, auto-locates operations in the tree
- **Markdown rendering** — operation descriptions and field docs rendered via `@powerduck/md-editor` (code highlighting, tips admonitions)
- **Multi-language code examples** — generated via `@powerduck/openapi-codegen` (cURL, JavaScript/fetch, JavaScript/axios, Python/requests, Go), with response preview
- **Schema exploration** — nested property tables with expand/collapse, type labels, required indicators, constraint badges (enum, min/max, pattern, format), and oneOf/anyOf rendered as switchable tabs
- **Server selector** — automatic server URL switcher with variable resolution
- **Responsive** — sidebar collapses to overlay on tablet/mobile, code panel moves to slide-out drawer
- **Type-safe** — full TypeScript types, zero `any` in public API
- **Robust** — null-safe, circular reference detection, memoized rendering

## Installation

```bash
npm install @powerduck/oas-document @powerduck/md-editor @powerduck/openapi-codegen @powerduck/tree @powerduck/openapi-parser react-icons
```

Peer dependencies:

```bash
npm install react react-dom
```

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
  theme="light"
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
  } = useOasDocument(spec, { autoUpgrade: true, initialTheme: "light" });

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
| `theme` | `"light" \| "dark"` | `"light"` | Initial color theme. The root element receives `data-theme`. |
| `header` | `OasDocumentHeaderConfig` | — | Header configuration (logo, title, nav items, theme toggle). |
| `showTree` | `boolean` | `true` | Whether to show the sidebar tree. |
| `treeWidth` | `number` | `340` | Sidebar width in pixels. When omitted, width is restored from `localStorage` (key: `pde-oas-sidebar-width`); manual drag-resize saves automatically. Range: 200–480. |

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
  autoUpgrade?: boolean;
  defaultOperationId?: string;
  initialTheme?: "light" | "dark"; // default "light"
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

The palette follows `powerduck-react/src/theme/tokens.css`. Surfaces, text,
borders, semantic colors, control heights, and radii use the shared `--color-*`,
`--control-height-*`, and `--radius-*` tokens. The `--pde-*` variables provide
compatibility aliases. Override both the document and portalled menu scopes so
custom colors remain consistent:

```css
:is(.pde-oas-root, .pde-oas-theme) {
  --color-accent: #635bff;
  --color-surface: #ffffff;
}

:is(.pde-oas-root, .pde-oas-theme)[data-theme="dark"] {
  --color-accent: #a5a0ff;
  --color-surface: #1f2125;
}
```

Language menus include colorful icons, readable labels, keyboard navigation, and
viewport-aware positioning. Menus escape card clipping but remain inside a native
modal's top layer. Code and response scrollbars stay transparent until hover or
keyboard focus; touch devices retain visible scroll affordances.

The React entry requires a bundler that handles CSS imports. Use the core entry
for direct Node.js execution without a stylesheet loader.

## Auto-Upgrade

By default, `autoUpgrade` is `true`. The input is validated and upgraded to OpenAPI 3.2 via `@powerduck/openapi-parser`. Disable it when you already have a valid OAS 3.2 document:

```tsx
<OasDocument input={validOas32Doc} autoUpgrade={false} />
```

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

## Interaction and performance

The reference layout pairs endpoint descriptions with code examples. Navigation
tracks the top of the reading pane. On small screens, native modal drawers provide
keyboard focus management, Escape dismissal, and independent code access even
when `showTree` is false. Language and HTTP client preferences are shared across
examples within one document instance.

Code examples are generated when they come within 600 pixels of the reading pane.
One observer is shared across pending examples and released when no work remains.
Syntax highlighting loads only the requested grammar. Its cache is limited to 64
entries and 1,000,000 UTF-16 code units, and examples longer than 50,000 characters
remain readable as plain text. Generated examples are bounded to six nested levels
and a 1,000-node traversal budget. Explicit response examples take precedence over
generated values. These safeguards do not truncate the source API document.

Navigation indexing is linear in the number of nodes and operations. Scroll tracking
uses a passive listener, one animation frame per update, and a binary search over
section positions. Browser layout costs still depend on document complexity; this
component does not virtualize the entire documentation page.

Treat input objects as immutable and pass a new object when the document changes.
`autoUpgrade={false}` skips full validation but still requires a document object with
`openapi` and `info` fields. Loading and derivation errors return empty collections
and a structured error instead of leaving a previous document active.

## License

MIT © [powerduck](https://www.powerduck.com)
