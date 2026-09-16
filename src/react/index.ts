/* -------------------------------------------------------------------------- */
/* React layer barrel                                                          */
/* -------------------------------------------------------------------------- */

export { default as OasDocument } from "./OasDocument";

export { useOasDocument } from "./hooks/useOasDocument";

export type {
  UseOasDocumentOptions,
  UseOasDocumentResult,
} from "./hooks/useOasDocument";

export type {
  OasDocumentHandle,
  OasDocumentProps,
  OasDocumentHeaderConfig,
  OasDocumentNavItem,
} from "./libs/types";
