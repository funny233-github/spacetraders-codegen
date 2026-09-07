import { Endpoint } from './types';
import { OpenApiSpec, IrClassJson } from './types';

export function generateIrClass(endpoint: Endpoint, spec: OpenApiSpec): IrClassJson {
  const classes: any[] = [];
  const components = spec.components || {};
  const schemas = components.schemas || {};

  // Collect all needed types from request and response
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

function convertSchemaToIrClass(name: string, schema: any): any | null {
  // Determine kind based on schema structure
  const kind = determineClassKind(schema);

  const classDef: any = {
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

function convertFields(properties: any, required: string[] | undefined): any[] {
  const fields: any[] = [];

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

function convertEnumMembers(enumValues: any[]): any[] {
  return enumValues.map((value, index) => ({
    name: `VALUE_${index}`, // Simplified naming
    value: value,
  }));
}

function collectNeededTypes(requestSchema: any, responseSchema: any): Set<string> {
  const needed = new Set<string>();

  function extractRefs(obj: any, depth = 0) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.$ref && typeof obj.$ref === 'string') {
      needed.add(obj.$ref);
    }
    for (const key of Object.keys(obj)) {
      extractRefs(obj[key], depth + 1);
    }
  }

  if (requestSchema) extractRefs(requestSchema);
  if (responseSchema) extractRefs(responseSchema);

  // Note: We no longer hardcode "NavigateApiResponse" - this will need to be
  // handled based on the endpoint's response structure. For now, we rely on
  // the schemas referenced in the responseSchema itself.

  return needed;
}
