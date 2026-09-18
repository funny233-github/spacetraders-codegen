import {
  Endpoint,
  getResponseTypeInterfaceName,
  getFunctionName,
} from "./extractEndpoint";
import { normalizeRefName } from "./convertSchemaToIrType";

// Function parameter for IR
export interface IrFunctionParameter {
  name: string;
  type: string;
  required: boolean;
  comment?: string;
  // Original OpenAPI body field name. Set when the variable name was renamed to
  // avoid a collision with a path/query param (e.g. body `shipSymbol` -> var
  // `shipSymbolBody`); the request body must still use this field name.
  fieldName?: string;
}

// API call representation
export interface IrApiCall {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  params?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
  // Set when the request body is a single value (e.g. a $ref to a model)
  // rather than an object whose properties become individual parameters.
  bodyKind?: "direct";
}

// Error handling configuration
export interface IrErrorHandling {
  type: "generic" | "specific";
  genericMessage?: string;
  specificErrors?: Array<{
    code: number;
    message?: string;
  }>;
}

// Data processor after API call.
//
// SpaceTraders responses are uniform: every endpoint either wraps its payload
// in a { data, meta } envelope (already unwrapped by HttpClient.send()) or
// returns a flat object. The only post-processing required is extracting the
// payload from the client's ApiResponse wrapper to match the function's
// Promise<T> signature. The OpenAPI spec defines no envelope/unwrapping/
// transformation concept, so there is a single processor semantic.
export interface IrDataProcessor {
  dataField: string; // response.<dataField> — always "data"
}

// Function body representation
export interface IrFunctionBody {
  apiCall: IrApiCall; // The actual API invocation
  errorHandling: IrErrorHandling; // Error handling configuration
  postProcessing: IrDataProcessor; // Data processing after API call
}

// IR function definition for code generation
export interface IrFunctionDefinition {
  name: string;
  tag: string; // Tag/group this function belongs to
  parameters: IrFunctionParameter[];
  returnType: string;
  body: IrFunctionBody;
  comment?: string;
  security?: Array<Record<string, string[]>>; // Security requirements
}

// IR function JSON structure (output format)
export interface IrFunctionJson {
  functions: IrFunctionDefinition[];
}

/**
 * Generate IR function definition for a single endpoint.
 */
export function generateIrFunction(endpoint: Endpoint): IrFunctionJson {
  return { functions: [generateSingleFunction(endpoint)] };
}

/**
 * Extract OpenAPI constraint annotations from a raw schema, used for function
 * parameter comments. Mirrors getFieldConstraints in generateTypesFromIR but
 * operates on the raw schema shape so path/query/body params get the same
 * validation hints (minLength, minimum, maximum, format, enum, ...).
 */
function inferConstraintAnnotations(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const annotations: string[] = [];
  if (typeof s.minLength === "number")
    annotations.push(`minLength: ${s.minLength}`);
  if (typeof s.maxLength === "number")
    annotations.push(`maxLength: ${s.maxLength}`);
  if (typeof s.minimum === "number") annotations.push(`minimum: ${s.minimum}`);
  if (typeof s.maximum === "number") annotations.push(`maximum: ${s.maximum}`);
  if (typeof s.pattern === "string") annotations.push(`pattern: ${s.pattern}`);
  if (typeof s.format === "string") annotations.push(`format: ${s.format}`);
  if (Array.isArray(s.enum)) annotations.push(`enum: ${s.enum.join(" | ")}`);
  return annotations;
}

/**
 * Return a variable name that does not collide with any name already in `used`.
 * Colliding body fields (e.g. a body `shipSymbol` alongside a path `shipSymbol`)
 * get a distinct variable so the generated signature stays valid.
 */
function uniqueParamName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let candidate = `${name}_body`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${name}_${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Append constraint annotations to a parameter's description comment so the
 * generated signature documents validation rules alongside the description.
 */
function withConstraintAnnotations(
  description: string | undefined,
  schema: unknown,
): string | undefined {
  const annotations = inferConstraintAnnotations(schema);
  if (annotations.length === 0) return description;
  const base = description ? `${description} ` : "";
  return `${base}(${annotations.join(", ")})`;
}

export function generateSingleFunction(endpoint: Endpoint): IrFunctionDefinition {
  // Derive function name from operationId (camelCased) or endpointName.
  const functionName = getFunctionName(endpoint);

  // Build function parameters from endpoint parameters (path/query)
  const parameters: IrFunctionParameter[] = (endpoint.parameters || []).map(
    (param) => ({
      name: param.name,
      type: param.schema ? inferTypeFromSchema(param.schema) : "string",
      required: param.required ?? false,
      comment: withConstraintAnnotations(param.description, param.schema),
    }),
  );

  // Extract path/query param names first so body fields can be renamed when
  // they collide with one (e.g. body `shipSymbol` alongside path `shipSymbol`).
  const pathQueryParamNames = new Set<string>();
  if (endpoint.parameters) {
    for (const param of endpoint.parameters) {
      if (
        param.in === "query" ||
        param.in === "path" ||
        endpoint.path.includes(`{${param.name}}`)
      ) {
        pathQueryParamNames.add(param.name);
      }
    }
  }

  // Append request-body properties as parameters. The OpenAPI `parameters`
  // array only lists path/query params, so body fields would otherwise be
  // dropped from the generated signature (and the body would be emitted as
  // an empty `Record<string, never>`). Derive each field's type, required
  // flag (from the schema's `required` array), and description from the
  // request body schema. Body fields that collide with a path/query param are
  // renamed to keep the signature valid.
  const bodyParams = inferRequestBodyParameters(
    endpoint.requestBodySchema,
    pathQueryParamNames,
  );
  parameters.push(...bodyParams);

  // TypeScript requires required parameters to precede optional ones. Stable-sort
  // so required params (path params, required body fields) come first while the
  // relative order within each group is preserved.
  parameters.sort((a, b) =>
    a.required === b.required ? 0 : a.required ? -1 : 1,
  );

  // Extract path parameters from endpoint (those used in URL paths)
  const pathParams: Record<string, string> = {};
  // Extract query parameters (in === 'query'). These become function params and
  // must be threaded into the request, otherwise list endpoints ignore them.
  const queryParams: Record<string, string> = {};
  if (endpoint.parameters) {
    for (const param of endpoint.parameters) {
      if (param.in === "query") {
        queryParams[param.name] = param.name;
      } else if (
        param.in === "path" ||
        endpoint.path.includes(`{${param.name}}`)
      ) {
        pathParams[param.name] = param.name;
      }
    }
  }

  // Build API call
  const apiCall: IrApiCall = {
    method: endpoint.method as "GET" | "POST" | "PUT" | "DELETE",
    path: endpoint.path,
    params: pathParams,
    query: queryParams,
    body: endpoint.requestBodySchema ? "requestBody" : undefined,
    // A body that is a single value ($ref/scalar/array) is passed through
    // as-is rather than being wrapped in an object literal.
    bodyKind: isDirectBodySchema(endpoint.requestBodySchema)
      ? "direct"
      : undefined,
  };

  // Build error handling
  const errorHandling: IrErrorHandling = {
    type: "generic",
    genericMessage: "API call failed",
  };

  // Build data processor
  const postProcessing: IrDataProcessor = {
    dataField: "data", // Extract the payload from the ApiResponse wrapper
  };

  // Build function body
  const functionBody: IrFunctionBody = {
    apiCall,
    errorHandling,
    postProcessing,
  };

  // Determine return type. For inline-object responses (no $ref, no array),
  // reference the generated per-endpoint *Response interface (named from the
  // function name) instead of the bare `object`, so callers receive a named,
  // typed payload. The same name is used for the http.get<T> generic.
  const returnType = endpoint.responseSchema
    ? inferReturnType(endpoint.responseSchema)
    : "void";
  const resolvedReturnType =
    returnType === "object" && endpoint.responseSchema
      ? getResponseTypeInterfaceName(endpoint)
      : returnType;

  // The function-level comment is the operation's description (the HTTP method's
  // .description field), not the short summary. Fall back to the summary only if
  // an endpoint has no description.
  const comment = endpoint.description || endpoint.summary;

  return {
    name: functionName,
    tag: endpoint.endpointName,
    parameters,
    returnType: resolvedReturnType,
    body: functionBody,
    comment,
    security: endpoint.security,
  };
}

/**
 * Infer the TypeScript type for a single schema object (used for body fields,
 * which may be inline objects or $ref references).
 */
function inferBodyFieldType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "string";
  // Inline object/array/etc.
  if ("type" in schema) return inferTypeFromSchema(schema);
  // $ref -> resolve to the referenced type name.
  if ("$ref" in schema && typeof schema.$ref === "string") {
    const parts = (schema.$ref as string).split("/");
    return parts[parts.length - 1];
  }
  return "string";
}

/**
 * Build IR parameters from a request body schema's `properties`.
 * Returns an empty array when there is no object body to model.
 */
function inferRequestBodyParameters(
  requestBodySchema: unknown,
  takenNames?: Set<string>,
): IrFunctionParameter[] {
  if (
    !requestBodySchema ||
    typeof requestBodySchema !== "object" ||
    !("properties" in requestBodySchema)
  ) {
    // A body without `properties` may still be a direct payload: a $ref to a
    // model (e.g. {"$ref": "Survey"}) or an inline scalar/array/enum. Model
    // it as a single required parameter; the renderer emits the parameter
    // itself as the request body. Empty object schemas yield no parameter
    // and render as an empty body object.
    const direct = inferDirectBodyParameter(requestBodySchema, takenNames);
    return direct ? [direct] : [];
  }

  const schema = requestBodySchema as {
    properties: Record<string, { schema?: unknown; description?: string }>;
    required?: unknown;
  };
  const requiredSet = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  return Object.entries(schema.properties).map(([fieldName, prop]) => {
    // The field schema may live under `.schema` or sit directly on the property
    // (as in the SpaceTraders spec, where `minLength`/`minimum`/`type` are on
    // the property itself). Resolve whichever is present so both type inference
    // and constraint annotations see the real schema.
    const fieldSchema = (
      prop.schema !== undefined ? prop.schema : prop
    ) as unknown;
    // If the body field name collides with a path/query param already in the
    // signature, give it a distinct variable name but keep the original field
    // name so the request body is still correct.
    const name = uniqueParamName(fieldName, takenNames || new Set<string>());
    return {
      name,
      fieldName,
      type: inferBodyFieldType(fieldSchema),
      required: requiredSet.has(fieldName),
      comment: withConstraintAnnotations(prop.description, fieldSchema),
    };
  });
}

/**
 * True when a request body schema is a single value (a $ref to a model, an
 * inline scalar/array/enum) rather than an object with properties.
 */
export function isDirectBodySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  if ("properties" in s) return false;
  if (typeof s.$ref === "string") return true;
  if (Array.isArray(s.enum)) return true;
  return typeof s.type === "string" && s.type !== "object";
}

/**
 * Build a single IR parameter for a "direct" request body — a payload that is
 * one value rather than an object with properties. Handles $ref bodies
 * (e.g. {"$ref": "Survey"} -> `survey: Survey`) and inline scalar/array/enum
 * bodies (-> `body: <type>`). Returns null for empty object schemas, which
 * render as an empty body object.
 */
function inferDirectBodyParameter(
  schema: unknown,
  takenNames?: Set<string>,
): IrFunctionParameter | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;
  const description =
    typeof s.description === "string" ? s.description : undefined;

  if (typeof s.$ref === "string") {
    const typeName = normalizeRefName(s.$ref);
    const name = uniqueParamName(lowerCamel(typeName), takenNames || new Set<string>());
    return {
      name,
      fieldName: name,
      type: typeName,
      required: true,
      comment: withConstraintAnnotations(description, s),
    };
  }

  if (
    Array.isArray(s.enum) ||
    (typeof s.type === "string" && s.type !== "object")
  ) {
    const name = uniqueParamName("body", takenNames || new Set<string>());
    return {
      name,
      fieldName: name,
      type: inferTypeFromSchema(s),
      required: true,
      comment: withConstraintAnnotations(description, s),
    };
  }

  return null;
}

/** `Survey` -> `survey`; names direct-body parameters after their type. */
function lowerCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Infer TypeScript type from a schema object
 */
function inferTypeFromSchema(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "any";

  // Check for $ref
  if ("$ref" in schema && typeof schema.$ref === "string") {
    const parts = schema.$ref.split("/");
    return parts[parts.length - 1];
  }

  // Check type
  if ("type" in schema) {
    switch (schema.type) {
      case "string":
        return "string";
      case "number":
        return "number";
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "array":
        if ("items" in schema && schema.items) {
          const itemType = inferTypeFromSchema(schema.items);
          return `Array<${itemType}>`;
        }
        return "Array<unknown>";
      case "object":
        return "object";
      default:
        return "any";
    }
  }

  return "any";
}

/**
 * Infer the TypeScript return type from a response schema.
 *
 * SpaceTraders wraps payloads in a `{ data: <T> }` envelope, and the generated
 * function returns `response.data`, so the return type is the type of `data`.
 * Unwrap that envelope and resolve the inner type. `$ref` references resolve to
 * the generated class name (the model name with the `.json` extension dropped).
 */
function inferReturnType(responseSchema: unknown): string {
  if (!responseSchema || typeof responseSchema !== "object") return "any";

  // Top-level $ref -> referenced type name (e.g. "#/components/schemas/Fleet" -> "Fleet").
  if ("$ref" in responseSchema && typeof responseSchema.$ref === "string") {
    return normalizeRefName(responseSchema.$ref as string);
  }

  if (Array.isArray(responseSchema)) return "Array<unknown>";

  const schema = responseSchema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
  };

  // Standard SpaceTraders envelope: { data: <innerType> }.
  if (schema.properties && "data" in schema.properties) {
    return inferReturnType(schema.properties.data);
  }

  // Array response: [ <itemType> ].
  if (schema.type === "array" && schema.items) {
    return `Array<${inferReturnType(schema.items)}>`;
  }

  // Bare object -> object.
  if (schema.type === "object" && schema.properties) {
    return "object";
  }

  return inferTypeFromSchema(responseSchema);
}

