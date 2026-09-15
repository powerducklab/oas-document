import type { CSSProperties, ReactNode } from "react";

import type { OpenApiDocument, OasOperation } from "../../core";

import type { OpenApiInput } from "@powerduck/openapi-parser";

/* -------------------------------------------------------------------------- */
/* Header configuration                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Navigation item rendered in the top header. Either `href` (anchor) or
 * `onClick` (button) should be provided.
 */
export interface OasDocumentNavItem {
  /** Visible label. */
  label: string;

  /** When set, renders an anchor linking to this URL. */
  href?: string;

  /** When set, renders a button invoking this handler. */
  onClick?: () => void;
}

/**
 * Configuration for the top application header (Stripe-style).
 */
export interface OasDocumentHeaderConfig {
  /** Logo image URL or a custom React node rendered at 24px height. */
  logo?: string | ReactNode;

  /** Header title shown next to the logo. Defaults to "API Documentation". */
  title?: string;

  /** Horizontal navigation links shown before the theme toggle. */
  navItems?: OasDocumentNavItem[];

  /** Whether to show the light/dark theme toggle button. Default true. */
  showThemeToggle?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Public component props                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Props accepted by the {@link OasDocument} React component.
 */
export interface OasDocumentProps {
  /**
   * OpenAPI document to render. Accepts a raw OpenAPI 3.x/3.2 object or a URL
   * pointing to one. When omitted the component renders nothing.
   */
  input: OpenApiInput | OpenApiDocument | null | undefined;

  /**
   * Validate and upgrade the input to OpenAPI 3.2 before rendering.
   * Defaults to `true`.
   */
  autoUpgrade?: boolean;

  /**
   * Operation id (or operationId) that should be selected on first render.
   */
  defaultOperationId?: string;

  /**
   * Called whenever the selected operation changes (tree click or imperative
   * {@link OasDocumentHandle.selectOperation}). Scroll-spy initiated changes
   * do not fire this callback.
   */
  onOperationChange?: (operation: OasOperation) => void;

  /** Extra class name applied to the root element. */
  className?: string;

  /** Extra inline styles applied to the root element. */
  style?: CSSProperties;

  /**
   * Initial theme. Defaults to `"light"`. The root element receives
   * `data-theme` and all colors resolve through CSS variables.
   */
  theme?: "light" | "dark";

  /**
   * Top header configuration (logo, title, navigation, theme toggle).
   */
  header?: OasDocumentHeaderConfig;

  /** Whether to show the sidebar tree. Default true. */
  showTree?: boolean;

  /** Sidebar width in pixels. Default 280. */
  treeWidth?: number;
}

/**
 * Imperative handle exposed by {@link OasDocument} via `ref`.
 */
export interface OasDocumentHandle {
  /** The outermost DOM node rendered by the component. */
  getRootElement: () => HTMLDivElement | null;

  /** All operations flattened from the document, in navigation order. */
  getOperations: () => OasOperation[];

  /** The operation currently selected in the sidebar / detail pane. */
  getSelectedOperation: () => OasOperation | undefined;

  /** Selects an operation by id (or operationId). Returns false if not found. */
  selectOperation: (operationId: string) => boolean;

  /** Scrolls the reading pane back to the top of the current (or given) operation. */
  scrollToOperation: (operationId?: string) => void;

  /** Moves keyboard focus into the tree search field. */
  focusSearch: () => void;
}
