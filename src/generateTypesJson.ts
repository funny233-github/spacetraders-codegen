import { NavigateEndpoint } from './types';
import { OpenApiSpec } from './types';

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

export function generateTypesJson(endpoint: NavigateEndpoint, spec: OpenApiSpec): IrClassJson {
  const classes: IrClassDefinition[] = [];
  const components = spec.components || {};
  const schemas = components.schemas || {};

  // Collect all needed types
  const neededTypes = collectNeededTypes(endpoint.requestBodySchema, endpoint.responseSchema);

  // Process each schema
  for (const [typeName, schema] of Object.entries(schemas)) {
    if (neededTypes.has(typeName)) {
      const classDef = convertSchemaToIrClass(typeName, schema);
      if (classDef) {
        classes.push(classDef);
      }
    }
  }

  return { classes };
}

function convertSchemaToIrClass(name: string, schema: any): IrClassDefinition | null {
  // Determine kind based on schema structure
  const kind = determineClassKind(schema);

  const classDef: IrClassDefinition = {
    name: name,
    kind: kind,
    comment: schema.description || undefined,
    generics: schema.generics ? schema.generics : undefined,
    extends: schema.extends ? schema.extends : undefined,
  };

  // Process based on kind
  if (kind === 'interface' || kind === 'class') {
    classDef.fields = convertFields(schema.properties, schema.required);
  } else if (kind === 'enum') {
    classDef.members = convertEnumMembers(schema.enum);
  } else if (kind === 'typeAlias') {
    // For type aliases, store the original schema
    classDef.typeSchema = schema;
  }

  return classDef;
}

function determineClassKind(schema: any): 'interface' | 'enum' | 'typeAlias' | 'class' {
  if (schema.enum && Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (schema.type === 'object' || !schema.type) {
    return 'interface';
  }
  if (schema.type === 'string' && schema.enum) {
    return 'enum';
  }
  return 'interface';
}

function convertFields(properties: any, required: string[] | undefined): IrField[] {
  const fields: IrField[] = [];

  if (!properties || typeof properties !== 'object') return fields;

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (!fieldSchema || typeof fieldSchema !== 'object') continue;
    
    const isRequired = required && required.includes(fieldName) ? true : false;
    
    // Simplify type extraction
    let type = 'any';
    if (typeof fieldSchema === 'object' && 'type' in fieldSchema) {
      const fieldType = (fieldSchema as any).type;
      type = fieldType === 'string' ? 'string' : 
             fieldType === 'number' ? 'number' :
             fieldType === 'boolean' ? 'boolean' :
             fieldType === 'array' ? 'Array<any>' : 'object';
    } else if (typeof fieldSchema === 'object' && '$ref' in fieldSchema) {
      type = (fieldSchema as any).$ref; // Keep the reference
    }

    fields.push({
      name: fieldName,
      type: type,
      required: isRequired,
      comment: typeof fieldSchema === 'object' ? (fieldSchema as any).description || undefined : undefined,
    });
  }

  return fields;
}

function convertEnumMembers(enumValues: any[]): IrEnumMember[] {
  return enumValues.map((value, index) => ({
    name: `VALUE_${index}`, // Simplified naming
    value: value,
  }));
}

function collectNeededTypes(requestSchema: any, responseSchema: any): Set<string> {
  const needed = new Set<string>();

  function extractRefs(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.$ref && typeof obj.$ref === 'string') {
      // $ref now contains just the model name
      needed.add(obj.$ref);
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
