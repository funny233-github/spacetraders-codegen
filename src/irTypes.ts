// IR type definitions for the code generator.
//
// The IR mirrors the generated output:
//   - `types-IR.json`  holds the GLOBAL component types (shared, named).
//   - `{tag}/{function}-IR.json` holds one function plus its LOCAL response type.
//
// Field types are a small structural tree (`IrType`). Constraints (for
// `is_valid()`) live on the field (`IrField2`), while the tree is purely
// structural. Enums are represented as a type node so they render as a TS union.

import { IrFunctionDefinition } from "./generateIrFunction";

// ---------------------------------------------------------------------------
// Field constraints (checked by is_valid())
// ---------------------------------------------------------------------------

export interface IrFieldConstraints {
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

// ---------------------------------------------------------------------------
// Field in an object
// ---------------------------------------------------------------------------

export interface IrField2 extends IrFieldConstraints {
  name: string;
  type: IrType;
  optional?: boolean; // -> `field?` in TS
  description?: string;
}

// ---------------------------------------------------------------------------
// Structural type node
// ---------------------------------------------------------------------------

export type IrPrimitiveType = "string" | "number" | "boolean";

export interface IrRefType {
  kind: "ref";
  name: string; // global (types-IR.json) type name; imported where used
}

export interface IrPrimitiveTypeNode {
  kind: "primitive";
  type: IrPrimitiveType;
}

export interface IrEnumType {
  kind: "enum";
  values: string[];
}

export interface IrArrayType {
  kind: "array";
  items: IrType;
}

export interface IrObjectType {
  kind: "object";
  fields: IrField2[];
  // additionalProperties schema -> `{ [k: string]: mapValue }`
  mapValue?: IrType;
}

export type IrType =
  | IrRefType
  | IrPrimitiveTypeNode
  | IrEnumType
  | IrArrayType
  | IrObjectType;

// ---------------------------------------------------------------------------
// Response type (named local type in the function file)
// ---------------------------------------------------------------------------

export type ResponseKind = "class" | "interface";

export interface IrResponse {
  name: string;
  kind: ResponseKind;
  fields: IrField2[];
}

// ---------------------------------------------------------------------------
// Global (component) type
// ---------------------------------------------------------------------------

export type GlobalKind = "interface" | "enum" | "typeAlias" | "class";

export interface IrEnumMember {
  name: string;
  value?: unknown;
}

export interface IrGlobalType {
  name: string;
  kind: GlobalKind;
  comment?: string;
  fields?: IrField2[];
  members?: IrEnumMember[];
  // For typeAlias: the raw schema used to derive the alias base type.
  typeSchema?: unknown;
}

// ---------------------------------------------------------------------------
// Function file IR + document
// ---------------------------------------------------------------------------

export interface IrFunctionFile {
  function: IrFunctionDefinition;
  // Local response type (R1). Omitted for scalar/void/ref responses (R2/R3).
  responseType?: IrResponse;
}

export interface IrDocument {
  // Global component types (written to types-IR.json -> types.ts).
  types: IrGlobalType[];
}

// Re-exported so consumers can import function IR from one place.
export type { IrFunctionDefinition };
