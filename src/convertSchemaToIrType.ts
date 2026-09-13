// Convert a (merged) OpenAPI schema into the structural `IrType` tree.
//
// The merged spec (see mergeSpec) has all `$ref`s rewritten to `{ "$ref": "ModelName" }`
// (clean model names) and every property holds its schema inline. This module turns
// those schemas into `IrType` nodes that the generators render to TypeScript.
//
// Rules (highest priority first):
//   $ref            -> ref node (global type, imported where used)
//   enum            -> enum node (renders as `"a" | "b"`)
//   array           -> array node (renders as `Array<items>`)
//   object/props    -> object node (renders as `{ … }` or `{ [k]: mapValue }`)
//   string/boolean  -> primitive node
//   number/integer  -> primitive node (number)
//   fallback        -> primitive string

import {
  IrField2,
  IrType,
  IrObjectType,
} from "./irTypes";

export interface RawSchema {
  type?: string;
  properties?: Record<string, RawSchema>;
  items?: RawSchema;
  $ref?: string;
  enum?: unknown[];
  additionalProperties?: RawSchema | boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  description?: string;
  required?: string[];
}

/** Resolve a `$ref` to a clean type name (drop path + `.json`). */
export function normalizeRefName(ref: string): string {
  const base = ref.split("/").pop() ?? "";
  return base.replace(/\.json$/, "");
}

/** Coerce enum values to strings (ST symbol enums are strings). */
function enumValues(enumVal: unknown[]): string[] {
  return enumVal.map((v) => String(v));
}

/** Convert a schema into a structural `IrType` node. */
export function convertSchema(schema: RawSchema | undefined): IrType {
  if (!schema || typeof schema !== "object") {
    return { kind: "primitive", type: "string" };
  }

  // $ref -> global type reference
  if (schema.$ref && typeof schema.$ref === "string") {
    return { kind: "ref", name: normalizeRefName(schema.$ref) };
  }

  // enum -> union node (takes precedence over the primitive `type`)
  if (Array.isArray(schema.enum)) {
    return { kind: "enum", values: enumValues(schema.enum) };
  }

  const type = schema.type;

  // array
  if (type === "array" && schema.items) {
    return { kind: "array", items: convertSchema(schema.items) };
  }

  // primitives
  if (type === "string" || type === "boolean") {
    return { kind: "primitive", type };
  }
  if (type === "number" || type === "integer") {
    return { kind: "primitive", type: "number" };
  }

  // object: explicit `type: object`, or implicit (properties / additionalProperties)
  if (
    type === "object" ||
    schema.properties ||
    (schema.additionalProperties && typeof schema.additionalProperties === "object")
  ) {
    return convertObjectSchema(schema);
  }

  // fallback
  return { kind: "primitive", type: "string" };
}

/** Convert an object schema's `properties` into a list of fields. */
export function convertObjectFields(schema: RawSchema): IrField2[] {
  const requiredSet = new Set(schema.required || []);
  const fields: IrField2[] = [];

  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      fields.push(convertField(name, prop, requiredSet.has(name)));
    }
  }

  return fields;
}

/** Convert an object schema into an `object` node. */
function convertObjectSchema(schema: RawSchema): IrObjectType {
  const fields = convertObjectFields(schema);

  let mapValue: IrType | undefined;
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    mapValue = convertSchema(schema.additionalProperties);
  }

  return { kind: "object", fields, ...(mapValue ? { mapValue } : {}) };
}

/** Convert a single object property into a field. */
function convertField(
  name: string,
  prop: RawSchema,
  required: boolean,
): IrField2 {
  return {
    name,
    type: convertSchema(prop),
    optional: !required,
    description: prop.description,
    minLength: prop.minLength,
    maxLength: prop.maxLength,
    minimum: prop.minimum,
    maximum: prop.maximum,
    pattern: prop.pattern,
    format: prop.format,
  };
}
