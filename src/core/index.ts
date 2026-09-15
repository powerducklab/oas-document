/* -------------------------------------------------------------------------- */
/* Core barrel                                                                 */
/* -------------------------------------------------------------------------- */
/*
 * Re-exports the pure, framework-agnostic OAS core.
 *
 * Note: both "./resolver" and "./schema" declare a `resolveSchema` export.
 * The resolver's `resolveSchema(document, schema)` is a thin alias of
 * `resolveSchemaReference(document, schema)`, so it is intentionally omitted
 * here to keep the barrel unambiguous. The lightweight `resolveSchema(schema)`
 * from "./schema" remains the canonical `resolveSchema` export.
 */

export * from "./types";
export * from "./schema";
export * from "./operations";
export * from "./examples";
export * from "./loader";

export {
  type ReferenceLike,
  type RecordLike,
  type OasResolveContext,
  isRecord,
  isReferenceLike,
  isSchemaRecord,
  resolveJsonPointer,
  isLocalReference,
  isExternalReference,
  resolveReference,
  resolveReferenceOrOriginal,
  createOasResolveContext,
  resolveOasValue,
  resolveSchemaReference,
  resolveParameter,
  resolveRequestBody,
  resolveResponse,
  resolveHeader,
  resolveExample,
  getComponents,
  getComponentCollection,
  getComponent,
  getProperty,
  getStringProperty,
  getBooleanProperty,
  getArrayProperty,
  getObjectProperty,
} from "./resolver";
