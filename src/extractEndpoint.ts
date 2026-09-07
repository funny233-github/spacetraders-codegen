import { OpenApiSpec, Endpoint } from './types';

/**
 * Extract a single endpoint from the spec
 */
export function extractEndpoint(spec: OpenApiSpec, path: string, method: 'get' | 'post' | 'put' | 'delete' = 'post'): Endpoint | null {
  const paths = spec.paths || {};
  const pathItem = paths[path];
  if (!pathItem) return null;

  const op = pathItem[method as keyof typeof pathItem];
  if (!op) return null;

  return buildEndpoint(path, method, op);
}

/**
 * Extract all endpoints from the spec
 */
export function extractAllEndpoints(spec: OpenApiSpec): Endpoint[] {
  const paths = spec.paths || {};
  const endpoints: Endpoint[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      const op = pathItem[method as keyof typeof pathItem];
      if (op) {
        endpoints.push(buildEndpoint(path, method, op));
      }
    }
  }

  return endpoints;
}

/**
 * Core function to build an Endpoint object
 */
function buildEndpoint(path: string, method: string, op: any): Endpoint {
  // Use tags[0] as primary source for endpointName (namespace grouping)
  let endpointName: string;

  if (op.tags && op.tags.length > 0) {
    endpointName = op.tags[0].toLowerCase().replace(/[^a-z0-9]/gi, '');
  } else if (op.operationId) {
    endpointName = op.operationId
      .replace(/[-_]/g, '')
      .replace(/^([A-Z])/g, (m: string) => m.toLowerCase());
  } else {
    const summary = op.summary || 'Unknown';
    endpointName = summary
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .replace(/^([A-Z])/g, (m: string) => m.toLowerCase());
  }

  const summary = op.summary || '';

  return {
    path: path,
    method: method,
    summary: summary,
    description: op.description || '',
    parameters: op.parameters?.map((p: any) => ({
      name: p.name,
      in: p.in,
      required: p.required,
      schema: p.schema,
      description: p.description
    })),
    requestBodySchema: op.requestBody?.content?.['application/json']?.schema,
    responseSchema: op.responses?.['200']?.content?.['application/json']?.schema,
    responses: op.responses ? Object.entries(op.responses).map(([code, resp]: [string, any]) => ({
      code: parseInt(code),
      description: resp.description,
      schema: resp.content?.['application/json']?.schema
    })) : [],
    endpointName: endpointName,
  };
}
