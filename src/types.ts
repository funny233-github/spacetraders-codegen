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
  requestBodySchema?: any;
  responseSchema?: any;
}
