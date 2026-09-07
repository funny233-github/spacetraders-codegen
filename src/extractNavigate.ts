import { OpenApiSpec } from './types';

export interface NavigateEndpoint {
  path: string;
  method: 'post';
  summary: string;
  description: string;
  requestBodySchema?: any;
  responseSchema?: any;
}

export function extractNavigate(spec: OpenApiSpec): NavigateEndpoint | null {
  const paths = spec.paths || {};
  const navigatePath = paths['/my/ships/{shipSymbol}/navigate'];
  if (!navigatePath) return null;

  const postOp = navigatePath.post;
  if (!postOp) return null;

  // Build a simplified endpoint object
  const endpoint: NavigateEndpoint = {
    path: '/my/ships/{shipSymbol}/navigate',
    method: 'post',
    summary: postOp.summary || 'Navigate Ship',
    description: postOp.description || '',
    requestBodySchema: postOp.requestBody?.content?.['application/json']?.schema,
    responseSchema: postOp.responses['200']?.content?.['application/json']?.schema,
  };

  return endpoint;
}
