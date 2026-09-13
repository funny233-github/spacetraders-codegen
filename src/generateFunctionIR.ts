// Build per-function IR files (`{tag}/{function}-IR.json`) from endpoints.
//
// Each file is `{ function: IrFunctionDefinition, responseType?: IrResponse }`.
// The function IR is reused from generateSingleFunction. The response type is
// built by converting the endpoint's response schema into a named local type
// (R1). Non-object responses (R2 scalar/void, R3 $ref) have no responseType.

import { Endpoint } from "./extractEndpoint";
import { getResponseTypeInterfaceName } from "./extractEndpoint";
import { generateSingleFunction } from "./generateIrFunction";
import { RawSchema, convertObjectFields } from "./convertSchemaToIrType";
import { IrResponse, IrFunctionFile, IrField2 } from "./irTypes";

export function buildFunctionIR(endpoint: Endpoint): IrFunctionFile {
  const functionDef = generateSingleFunction(endpoint);
  const responseType = buildResponseType(endpoint);
  return { function: functionDef, responseType };
}

/**
 * Build the local response type (R1) from an endpoint's response schema.
 * Returns undefined for scalar/void/ref responses (R2/R3).
 */
function buildResponseType(endpoint: Endpoint): IrResponse | undefined {
  const responseSchema = endpoint.responseSchema as RawSchema | undefined;
  if (!responseSchema) return undefined;

  // Envelope: { data: <inner> } -> unwrap to the object payload.
  let payload: RawSchema | undefined;
  if (responseSchema.properties && responseSchema.properties.data) {
    const inner = responseSchema.properties.data;
    if (isObjectLike(inner)) {
      payload = inner;
    } else {
      // data is an array/ref/primitive -> no named response type (R2/R3)
      return undefined;
    }
  } else if (isObjectLike(responseSchema)) {
    // flat object response
    payload = responseSchema;
  } else {
    return undefined;
  }

  // payload must be an object with properties
  if (!payload.properties) return undefined;

  const fields = convertObjectFields(payload);
  return {
    name: getResponseTypeInterfaceName(endpoint),
    kind: detectResponseKind(fields),
    fields,
  };
}

/** A schema that models an object (has properties or `type: object`). */
function isObjectLike(schema: RawSchema): boolean {
  return Boolean(schema.properties) || schema.type === "object";
}

/**
 * Auto-detect the response kind (K1): `class` if any field carries a constraint
 * (so `is_valid()` is meaningful), otherwise `interface`.
 */
function detectResponseKind(fields: IrField2[]): "class" | "interface" {
  return hasConstraints(fields) ? "class" : "interface";
}

/** True if any field (recursively into nested objects) has a constraint. */
function hasConstraints(fields: IrField2[]): boolean {
  return fields.some((field) => {
    const constrainted =
      field.minLength !== undefined ||
      field.maxLength !== undefined ||
      field.minimum !== undefined ||
      field.maximum !== undefined ||
      field.pattern !== undefined ||
      field.format !== undefined;
    if (constrainted) return true;
    if (field.type.kind === "object" && field.type.fields) {
      return hasConstraints(field.type.fields);
    }
    return false;
  });
}
