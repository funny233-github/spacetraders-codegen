import { OpenApiSpec, NavigateEndpoint } from './types';

export function extractNavigate(spec: OpenApiSpec): NavigateEndpoint | null {
  const paths = spec.paths || {};
  const navigatePath = paths['/my/ships/{shipSymbol}/navigate'];
  if (!navigatePath) return null;

  const postOp = navigatePath.post;
  if (!postOp) return null;

  // Use tags[0] as primary source for endpointName (namespace grouping)
  let endpointName: string;
  
  if (postOp.tags && postOp.tags.length > 0) {
    // Use first tag as namespace identifier
    endpointName = postOp.tags[0].toLowerCase().replace(/[^a-z0-9]/gi, '');
  } else if (postOp.operationId) {
    // Fallback to operationId if no tags
    endpointName = postOp.operationId
      .replace(/[-_]/g, '')
      .replace(/^([A-Z])/g, (m: string) => m.toLowerCase());
  } else {
    // Last fallback to summary
    const summary = postOp.summary || 'Unknown';
    endpointName = summary
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .replace(/^([A-Z])/g, (m: string) => m.toLowerCase());
  }

  const summary = postOp.summary || 'Navigate Ship';

  // Build a simplified endpoint object with all relevant fields
  const endpoint: NavigateEndpoint = {
    path: navigatePath['post']?.path || '/my/ships/{shipSymbol}/navigate',
    method: 'post',
    summary: summary,
    description: postOp.description || '',
    parameters: postOp.parameters?.map((p: any) => ({
      name: p.name,
      in: p.in,
      required: p.required,
      schema: p.schema,
      description: p.description
    })),
    requestBodySchema: postOp.requestBody?.content?.['application/json']?.schema,
    responses: postOp.responses ? Object.entries(postOp.responses).map(([code, resp]: [string, any]) => ({
      code: parseInt(code),
      description: resp.description,
      schema: resp.content?.['application/json']?.schema
    })) : [],
    endpointName: endpointName,
  };

  return endpoint;
}
