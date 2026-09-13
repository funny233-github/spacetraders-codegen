// Build `types-IR.json` (the global component types) from the merged spec's
// component schemas. Each component schema becomes one global type:
//   - enum  -> enum type (const + union)
//   - object -> interface (fields from properties)
//   - other -> typeAlias (raw schema)
//
// Global types are plain interfaces (no `is_valid()`); validation lives on the
// per-function response types.

import { RawSchema, convertObjectFields } from "./convertSchemaToIrType";
import { IrGlobalType, IrEnumMember } from "./irTypes";

export interface ComponentSchemaInput {
  name: string;
  schema: RawSchema;
}

export function buildGlobalTypesIR(
  componentSchemas: ComponentSchemaInput[],
): IrGlobalType[] {
  const types: IrGlobalType[] = [];
  for (const { name, schema } of componentSchemas) {
    const t = buildGlobalType(name, schema);
    if (t) types.push(t);
  }
  return types;
}

function buildGlobalType(
  name: string,
  schema: RawSchema,
): IrGlobalType | undefined {
  // enum
  if (Array.isArray(schema.enum)) {
    return {
      name,
      kind: "enum",
      comment: schema.description,
      members: convertEnumMembers(schema.enum),
    };
  }

  // object
  if (schema.properties || schema.type === "object") {
    return {
      name,
      kind: "interface",
      comment: schema.description,
      fields: convertObjectFields(schema),
    };
  }

  // other: typeAlias to the raw schema
  return {
    name,
    kind: "typeAlias",
    comment: schema.description,
    typeSchema: schema,
  };
}

/** Enum members are named `VALUE_<index>` (simple, guaranteed unique). */
function convertEnumMembers(enumValues: unknown[]): IrEnumMember[] {
  return enumValues.map((value, index) => ({
    name: `VALUE_${index}`,
    value,
  }));
}
