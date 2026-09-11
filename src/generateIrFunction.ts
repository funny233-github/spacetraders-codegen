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

  // Build function parameters from endpoint parameters
  const parameters: IrFunctionParameter[] = (endpoint.parameters || []).map(param => ({
    name: param.name,
    type: param.schema ? inferTypeFromSchema(param.schema) : 'string',
    required: param.required ?? false,
    comment: param.description,
  }));

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

  return {
    functions: [{
      name: functionName,
      tag: endpoint.endpointName,
      parameters,
      returnType,
      body: functionBody,
      comment: endpoint.summary || endpoint.description,
    }],
  };
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
 * Infer return type from response schema
 */
function inferReturnType(responseSchema: unknown): string {
  if (!responseSchema || typeof responseSchema !== 'object') return 'any';

  // Check for $ref
  if ('$ref' in responseSchema && typeof responseSchema.$ref === 'string') {
    const parts = responseSchema.$ref.split('/');
    return parts[parts.length - 1];
  }

  // Check type
  if ('type' in responseSchema) {
    switch (responseSchema.type) {
      case 'object':
        // If it has properties, it's an interface
        if ('properties' in responseSchema && responseSchema.properties) {
          return 'object';
        }
        return 'object';
      case 'array':
        if ('items' in responseSchema && responseSchema.items) {
          const itemType = inferReturnType(responseSchema.items);
          return `Array<${itemType}>`;
        }
        return 'Array<unknown>';
      default:
        return inferTypeFromSchema(responseSchema);
    }
  }

  return 'any';
}
