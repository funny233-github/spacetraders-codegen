import fs from 'fs';
import path from 'path';
import { OpenApiSpec } from './mergeSpec';

// Endpoint representation for a single API operation
interface EndpointParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: unknown;
  description?: string;
}

interface EndpointResponse {
  code: number;
  description?: string;
  schema?: unknown;
}

export interface Endpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  endpointName: string; // From tags[0]
  tags?: string[];      // Original tags array
  operationId?: string; // Optional operation ID
  parameters?: EndpointParameter[];
  requestBodySchema?: unknown;
  responseSchema?: unknown;
  responses?: EndpointResponse[];
  security?: Array<Record<string, string[]>>; // Security requirements for this endpoint
}

/**
 * Build an endpoint object from OpenAPI spec data
 */
export function buildEndpoint(
  path: string,
  method: string,
  operation: any,
  tags: string[],
  operationId?: string,
  globalSecurity?: Array<Record<string, string[]>>
): Endpoint {
  const endpoint: Endpoint = {
    path,
    method,
    summary: operation.summary || '',
    description: operation.description || '',
    endpointName: tags[0] || 'default',
    tags: tags,
    operationId: operationId,
    parameters: operation.parameters?.map((param: any) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      schema: param.schema,
      description: param.description,
    })),
    requestBodySchema: operation.requestBody?.content?.['application/json']?.schema || null,
    responseSchema: extractResponseSchema(operation.responses),
    responses: operation.responses
      ? Object.entries(operation.responses).map(([code, resp]: [string, any]) => ({
          code: parseInt(code),
          description: resp.description,
          schema: resp.content?.['application/json']?.schema || null,
        }))
      : undefined,
    security: operation.security || globalSecurity,
  };

  return endpoint;
}

/**
 * Extract response schema from responses object
 */
function extractResponseSchema(responses: any): unknown {
  if (!responses) return null;

  // Look for 200 or 201 response with JSON schema
  const successCodes = ['200', '201'];
  for (const code of successCodes) {
    if (responses[code]) {
      const resp = responses[code];
      if (resp.content?.['application/json']?.schema) {
        return resp.content['application/json'].schema;
      }
    }
  }

  // Fallback: return first available schema
  for (const resp of Object.values(responses)) {
    if (resp && typeof resp === 'object' && 'content' in resp) {
      const content = (resp as any).content;
      if (content?.['application/json']?.schema) {
        return content['application/json'].schema;
      }
    }
  }

  return null;
}

/**
 * Extract all endpoints from OpenAPI spec
 */
export function extractEndpoints(spec: OpenApiSpec): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = spec.paths || {};
  const globalSecurity = spec.globalSecurity;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    // Process each HTTP method
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const operation = (pathItem as any)[method];
      if (!operation || typeof operation !== 'object') continue;

      // Get tags from operation or path level
      const tags = operation.tags || [];
      const operationId = operation.operationId;

      // Build endpoint object
      const endpoint = buildEndpoint(path, method.toUpperCase(), operation, tags, operationId, globalSecurity);

      // Only include if it has a summary or description
      if (endpoint.summary || endpoint.description) {
        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

/**
 * Load OpenAPI spec from file
 */
export function loadSpec(specPath: string): OpenApiSpec {
  const content = fs.readFileSync(specPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Extract a specific endpoint by path and method
 */
export function extractEndpointByPath(
  spec: OpenApiSpec,
  path: string,
  method: string
): Endpoint | null {
  const endpoints = extractEndpoints(spec);
  return endpoints.find(
    ep => ep.path === path && ep.method === method.toUpperCase()
  ) || null;
}
