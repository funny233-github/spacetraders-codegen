import { Endpoint } from './extractEndpoint';

// Function parameter for IR
export interface IrFunctionParameter {
  name: string;
  type: string;
  required: boolean;
  comment?: string;
}

// API call representation
export interface IrApiCall {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
}

// Error handling configuration
export interface IrErrorHandling {
  type: 'generic' | 'specific';
  genericMessage?: string;
  specificErrors?: Array<{
    code: number;
    message?: string;
  }>;
}

// Data processor after API call
export interface IrDataProcessor {
  type: 'simple' | 'transform' | 'custom';
  dataField?: string;        // For simple: response.data.xxx
  transformFunction?: string; // For transform: function name
  customCode?: string[];      // For custom: inline code
}

// Function body representation
export interface IrFunctionBody {
  apiCall: IrApiCall;         // The actual API invocation
  errorHandling: IrErrorHandling; // Error handling configuration
  postProcessing: IrDataProcessor; // Data processing after API call
}

// IR function definition for code generation
export interface IrFunctionDefinition {
  name: string;
  tag: string;          // Tag/group this function belongs to
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
 * Generate IR function definition for an endpoint
 */
export function generateIrFunction(endpoint: Endpoint): IrFunctionJson {
  // Derive function name from operationId or endpointName
  let functionName: string;
  if (endpoint.operationId) {
    functionName = endpoint.operationId
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      .replace(/^([a-z])/g, (m: string) => m.toLowerCase());
  } else {
    functionName = endpoint.endpointName;
  }

  // Build function parameters from endpoint parameters (path/query)
  const parameters: IrFunctionParameter[] = (endpoint.parameters || []).map(param => ({
    name: param.name,
    type: param.schema ? inferTypeFromSchema(param.schema) : 'string',
    required: param.required ?? false,
    comment: param.description,
  }));

  // Append request-body properties as parameters. The OpenAPI `parameters`
  // array only lists path/query params, so body fields would otherwise be
  // dropped from the generated signature (and the body would be emitted as
  // an empty `Record<string, never>`). Derive each field's type, required
  // flag (from the schema's `required` array), and description from the
  // request body schema.
  const bodyParams = inferRequestBodyParameters(endpoint.requestBodySchema);
  parameters.push(...bodyParams);

  // Extract path parameters from endpoint (those used in URL paths)
  const pathParams: Record<string, string> = {};
  if (endpoint.parameters) {
    for (const param of endpoint.parameters) {
      // Path parameters are typically in the URL path definition
      // If parameter is in the path string, it's a path param
      if (param.in === 'path' || endpoint.path.includes(`{${param.name}}`)) {
        pathParams[param.name] = param.name;
      }
    }
  }

  // Build API call
  const apiCall: IrApiCall = {
    method: endpoint.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: endpoint.path,
    params: pathParams,
    body: endpoint.requestBodySchema ? 'requestBody' : undefined,
  };

  // Build error handling
  const errorHandling: IrErrorHandling = {
    type: 'generic',
    genericMessage: 'API call failed',
  };

  // Build data processor
  const postProcessing: IrDataProcessor = {
    type: 'simple',
    dataField: 'data', // Assuming response has .data property
  };

  // Build function body
  const functionBody: IrFunctionBody = {
    apiCall,
    errorHandling,
    postProcessing,
  };

  // Determine return type
  const returnType = endpoint.responseSchema ? inferReturnType(endpoint.responseSchema) : 'void';

  const summaryOrDesc = endpoint.summary || endpoint.description;

  return {
    functions: [{
      name: functionName,
      tag: endpoint.endpointName,
      parameters,
      returnType,
      body: functionBody,
      comment: summaryOrDesc,
      security: endpoint.security,
    }],
  };
}

/**
 * Infer the TypeScript type for a single schema object (used for body fields,
 * which may be inline objects or $ref references).
 */
function inferBodyFieldType(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return 'string';
  // Inline object/array/etc.
  if ('type' in schema) return inferTypeFromSchema(schema);
  // $ref -> resolve to the referenced type name.
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    const parts = (schema.$ref as string).split('/');
    return parts[parts.length - 1];
  }
  return 'string';
}

/**
 * Build IR parameters from a request body schema's `properties`.
 * Returns an empty array when there is no object body to model.
 */
function inferRequestBodyParameters(
  requestBodySchema: unknown,
): IrFunctionParameter[] {
  if (
    !requestBodySchema ||
    typeof requestBodySchema !== 'object' ||
    !('properties' in requestBodySchema)
  ) {
    return [];
  }

  const schema = requestBodySchema as {
    properties: Record<string, { schema?: unknown; description?: string }>;
    required?: unknown;
  };
  const requiredSet = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: inferBodyFieldType(prop.schema),
    required: requiredSet.has(name),
    comment: prop.description,
  }));
}

/**
 * Infer TypeScript type from a schema object
 */
function inferTypeFromSchema(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return 'any';

  // Check for $ref
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    const parts = schema.$ref.split('/');
    return parts[parts.length - 1];
  }

  // Check type
  if ('type' in schema) {
    switch (schema.type) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'integer': return 'number';
      case 'boolean': return 'boolean';
      case 'array':
        if ('items' in schema && schema.items) {
          const itemType = inferTypeFromSchema(schema.items);
          return `Array<${itemType}>`;
        }
        return 'Array<unknown>';
      case 'object':
        return 'object';
      default: return 'any';
    }
  }

  return 'any';
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
  if (!responseSchema || typeof responseSchema !== 'object') return 'any';

  // Top-level $ref -> referenced type name (e.g. "#/components/schemas/Fleet" -> "Fleet").
  if ('$ref' in responseSchema && typeof responseSchema.$ref === 'string') {
    return normalizeRefName(responseSchema.$ref as string);
  }

  if (Array.isArray(responseSchema)) return 'Array<unknown>';

  const schema = responseSchema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
  };

  // Standard SpaceTraders envelope: { data: <innerType> }.
  if (schema.properties && 'data' in schema.properties) {
    return inferReturnType(schema.properties.data);
  }

  // Array response: [ <itemType> ].
  if (schema.type === 'array' && schema.items) {
    return `Array<${inferReturnType(schema.items)}>`;
  }

  // Bare object -> object.
  if (schema.type === 'object' && schema.properties) {
    return 'object';
  }

  return inferTypeFromSchema(responseSchema);
}

/**
 * Resolve a $ref path to a class type name, dropping the `.json` model
 * extension so it matches the generated class name
 * (e.g. "../models/Agent.json" -> "Agent").
 */
function normalizeRefName(ref: string): string {
  const base = ref.split('/').pop() ?? '';
  return base.replace(/\.json$/, '');
}
