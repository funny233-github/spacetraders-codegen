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
  endpointName: string; // From tags[0]
  tags?: string[];      // Original tags array
  operationId?: string; // Optional operation ID
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

export interface IrErrorHandling {
  type: 'generic' | 'specific';
  genericMessage?: string;
  specificErrors?: Array<{
    code: number;
    message?: string;
  }>;
}

export interface IrDataProcessor {
  type: 'simple' | 'transform' | 'custom';
  dataField?: string;        // For simple: response.data.xxx
  transformFunction?: string; // For transform: function name
  customCode?: string[];      // For custom: inline code
}

export interface IrFunctionBody {
  apiCall: IrApiCall;         // The actual API invocation
  errorHandling: IrErrorHandling; // Error handling configuration
  postProcessing: IrDataProcessor; // Data processing after API call
}

export interface IrFunctionDefinition {
  name: string;
  tag: string;          // Tag/group this function belongs to
  parameters: IrFunctionParameter[];
  returnType: string;
  body: IrFunctionBody;
  comment?: string;
}

export interface IrFunctionJson {
  functions: IrFunctionDefinition[];
}
