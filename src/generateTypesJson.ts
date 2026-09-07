import { NavigateEndpoint } from './extractNavigate';
import { OpenApiSpec } from './types';

export interface TypesJson {
  endpointName: string;
  requestType: any;
  responseTypes: { name: string; schema: any }[];
}

export function generateTypesJson(endpoint: NavigateEndpoint, spec: OpenApiSpec): TypesJson {
  // Extract all needed types from the endpoint's request and response schemas
  const neededTypes = collectNeededTypes(endpoint.requestBodySchema, endpoint.responseSchema);

  // Build type definitions from components.schemas
  const typeDefinitions: any[] = [];
  const components = spec.components || {};
  const schemas = components.schemas || {};

  for (const [typeName, schema] of Object.entries(schemas)) {
    if (neededTypes.has(typeName)) {
      typeDefinitions.push({ name: typeName, schema });
    }
  }

  return {
    endpointName: 'navigate',
    requestType: endpoint.requestBodySchema,
    responseTypes: [
      { name: 'NavigateResponse', schema: endpoint.responseSchema },
      ...typeDefinitions.map(t => ({ name: t.name, schema: t.schema })),
    ],
  };
}

function collectNeededTypes(requestSchema: any, responseSchema: any): Set<string> {
  const needed = new Set<string>();

  function extractRefs(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.$ref && typeof obj.$ref === 'string') {
      const match = obj.$ref.match(/\/schemas\/([^\/]+)$/);
      if (match) needed.add(match[1]);
    }
    for (const key of Object.keys(obj)) {
      extractRefs(obj[key]);
    }
  }

  if (requestSchema) extractRefs(requestSchema);
  if (responseSchema) extractRefs(responseSchema);

  // Also include response envelope type
  needed.add('NavigateApiResponse');

  return needed;
}
