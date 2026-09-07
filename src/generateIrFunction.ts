import { Endpoint } from './types';
import { OpenApiSpec, IrFunctionJson } from './types';

// Generate function IR dynamically from endpoint and spec
export function generateIrFunction(endpoint: Endpoint, spec: OpenApiSpec): IrFunctionJson {
  const functions: any[] = [];

  // Extract parameters from path and query
  const parameters = extractParameters(endpoint);

  // Determine return type from response
  const returnType = determineReturnType(endpoint, spec);

  // Build function name from endpointName or operationId
  const functionName = generateFunctionName(endpoint);

  // Generate API call details
  const apiCall = generateApiCall(endpoint);

  // Generate error handling
  const errorHandling = generateErrorHandling(endpoint);

  // Build function definition
  const functionDef: any = {
    name: functionName,
    signature: `async function ${functionName}(
      http: HttpClient,
      ${parameters.map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`).join(', ')}
    ): Promise<ApiResponse<${returnType}>>`,
    parameters: parameters,
    returnType: `Promise<ApiResponse<${returnType}>>`,
    body: {
      initialization: generateInitialization(endpoint),
      apiCall: apiCall,
      errorHandling: errorHandling,
      postProcessing: ['return response.data;']
    },
    comment: endpoint.description || endpoint.summary
  };

  functions.push(functionDef);

  return { functions };
}

function extractParameters(endpoint: Endpoint): any[] {
  const params: any[] = [];

  // Extract path parameters
  for (const param of endpoint.parameters || []) {
    if (param.in === 'path' || param.in === 'query') {
      params.push({
        name: param.name,
        type: (param.schema as any)?.type || 'any',
        required: param.required ?? false,
        comment: param.description
      });
    }
  }

  // Extract request body parameters (if any)
  if (endpoint.requestBodySchema && endpoint.requestBodySchema.properties) {
    for (const [name, schema] of Object.entries(endpoint.requestBodySchema.properties)) {
      if (schema && typeof schema === 'object' && 'type' in schema) {
        params.push({
          name: name,
          type: (schema as any).type || 'any',
          required: endpoint.requestBodySchema.required?.includes(name) ?? false,
          comment: (schema as any).description
        });
      }
    }
  }

  return params;
}

function determineReturnType(endpoint: Endpoint, spec: OpenApiSpec): string {
  // Find the response type from schemas
  const responses = endpoint.responses || [];
  for (const response of responses) {
    if (response.code === 200 && response.schema) {
      // Return the first property name or 'any'
      return extractResponseTypeName(response.schema);
    }
  }
  return 'any';
}

function extractResponseTypeName(schema: any): string {
  if (!schema || !schema.properties) return 'any';
  
  // Look for a data property in the response
  const dataSchema = schema.properties?.data;
  if (dataSchema && dataSchema.type === 'object') {
    // Return the first property name or 'data'
    const firstProp = Object.keys(dataSchema.properties || {})[0] || 'data';
    return `Data${firstProp.charAt(0).toUpperCase() + firstProp.slice(1)}`;
  }
  
  return 'any';
}

function generateFunctionName(endpoint: Endpoint): string {
  // Use endpointName as base, convert to camelCase
  const baseName = endpoint.endpointName || 'endpoint';
  return baseName.charAt(0).toUpperCase() + baseName.slice(1);
}

function generateApiCall(endpoint: Endpoint): any {
  const apiCall: any = {
    method: endpoint.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: endpoint.path,
    params: {},
    body: undefined,
    query: {}
  };

  // Extract path parameters (e.g., {shipSymbol} -> shipSymbol)
  const pathParams: string[] = [];
  const pathRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = pathRegex.exec(endpoint.path)) !== null) {
    pathParams.push(match[1]);
  }

  // Map path parameters to params object
  for (const param of endpoint.parameters || []) {
    if (param.in === 'path') {
      apiCall.params[param.name] = param.name;
    } else if (param.in === 'query') {
      apiCall.query[param.name] = param.name;
    }
  }

  // Determine if we need a body
  if (endpoint.requestBodySchema && Object.keys(endpoint.requestBodySchema.properties || {}).length > 0) {
    // Create a request object from body parameters
    apiCall.body = 'request';
  }

  return apiCall;
}

function generateErrorHandling(endpoint: Endpoint): string[] {
  const errorLines: string[] = [];

  // Get all response codes that indicate errors
  const errorResponses = endpoint.responses?.filter((r: any) => r.code >= 400);
  if (errorResponses && errorResponses.length > 0) {
    for (const response of errorResponses) {
      const description = response.description || 'Error';
      errorLines.push(`if (response.status === ${response.code}) {`);
      errorLines.push(`  throw new ApiError(response, "${description}");`);
      errorLines.push(`}`);
    }
  } else {
    // Generic error handling for any non-2xx response
    errorLines.push('if (!response.ok) {');
    errorLines.push('  throw new ApiError(response, "API request failed");');
    errorLines.push('}');
  }

  return errorLines;
}

function generateInitialization(endpoint: Endpoint): string[] {
  const initLines: string[] = [];

  // Check required parameters
  for (const param of endpoint.parameters || []) {
    if (param.required && param.in === 'path') {
      // Path parameters are already in function signature
    }
  }

  // Generate request body initialization if needed
  if (endpoint.requestBodySchema && Object.keys(endpoint.requestBodySchema.properties || {}).length > 0) {
    initLines.push(`const request = {`);
    
    // Add each required property to the request object
    for (const [name, schema] of Object.entries(endpoint.requestBodySchema.properties)) {
      if (schema && typeof schema === 'object' && 'type' in schema) {
        const desc = (schema as any).description || '';
        initLines.push(`  ${name}: ${name}, // ${desc}`);
      }
    }
    
    initLines.push('};');
    
    // Add validation for required properties
    for (const name of endpoint.requestBodySchema.required || []) {
      initLines.push(`if (!request.${name}) { throw new Error("${name} is required"); }`);
    }
  }

  return initLines;
}
