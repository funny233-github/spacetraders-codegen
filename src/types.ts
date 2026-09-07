export interface OpenApiSpec {
  openapi?: string;
  info?: any;
  paths?: Record<string, any>;
  components?: any;
}

// Generic endpoint representation
export interface Endpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  endpointName: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: any;
    description?: string;
  }>;
  requestBodySchema?: any;
  responseSchema?: any;
  responses?: Array<{
    code: number;
    description?: string;
    schema?: any;
  }>;
}

// IR Class Definition for code generation
export interface IrClassDefinition {
  name: string;
  kind: 'interface' | 'enum' | 'typeAlias' | 'class';
  comment?: string;
  fields?: IrField[];
  members?: IrEnumMember[];
  generics?: string[];
  extends?: string[];
  default?: any;
  typeSchema?: any; // For typeAlias, keep the original schema
}

export interface IrField {
  name: string;
  type: string;
  required: boolean;
  comment?: string;
  default?: any;
}

export interface IrEnumMember {
  name: string;
  value?: any;
}

export interface IrClassJson {
  classes: IrClassDefinition[];
}

// Function IR Definition for code generation
export interface IrFunctionParameter {
  name: string;
  type: string;
  required: boolean;
  comment?: string;
}

export interface IrApiCall {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
}

export interface IrFunctionBody {
  initialization: string[];  // Code lines before API call
  apiCall: IrApiCall;        // The actual API invocation
  errorHandling: string[];   // Error handling code
  postProcessing: string[];  // Code after successful call
}

export interface IrFunctionDefinition {
  name: string;
  signature: string;
  parameters: IrFunctionParameter[];
  returnType: string;
  body: IrFunctionBody;
  comment?: string;
}

export interface IrFunctionJson {
  functions: IrFunctionDefinition[];
}
