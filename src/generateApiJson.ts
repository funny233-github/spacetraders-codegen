import { NavigateEndpoint } from './extractNavigate';

export interface ApiJson {
  endpointName: string;
  path: string;
  method: 'post';
  summary: string;
  description: string;
  parameters: Array<{ name: string; in: 'path' | 'query'; required?: boolean; schema?: any }>;
  requestBody: any;
  responses: Array<{ code: number; description: string; schema?: any }>;
}

export function generateApiJson(endpoint: NavigateEndpoint): ApiJson {
  // Extract path parameters (shipSymbol in this case)
  const parameters: Array<{ name: string; in: 'path' | 'query'; required?: boolean; schema?: any }> = [
    { name: 'shipSymbol', in: 'path', required: true, schema: { type: 'string' } },
  ];

  // Extract query parameters (none for navigate)
  // Add query parameters if they exist in the endpoint definition

  // Build response list
  const responses = [
    { code: 200, description: 'Navigate successful', schema: endpoint.responseSchema },
  ];

  return {
    endpointName: 'navigate',
    path: endpoint.path,
    method: 'post',
    summary: endpoint.summary,
    description: endpoint.description,
    parameters,
    requestBody: endpoint.requestBodySchema,
    responses,
  };
}
