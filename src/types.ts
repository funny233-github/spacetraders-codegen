export interface OpenApiSpec {
  openapi?: string;
  info?: any;
  paths?: Record<string, any>;
  components?: any;
}

export interface NavigateEndpoint {
  path: string;
  method: 'post';
  summary: string;
  description: string;
  endpointName: string;  // Generated name for this endpoint (from tags)
  parameters?: Array<{
    name: string;
    in: 'path' | 'query';
    required?: boolean;
    schema?: any;
    description?: string;
  }>;
  requestBodySchema?: any;
  responses?: Array<{
    code: number;
    description?: string;
    schema?: any;
  }>;
  responseSchema?: any;
}
