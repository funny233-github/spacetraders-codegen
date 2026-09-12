import { Endpoint } from './extractEndpoint';
import { OpenApiSpec } from './mergeSpec';

// Intermediate field structure for class definitions
export interface IrField {
  name: string;
  type: string;
  required: boolean;
  comment?: string;
  fields?: IrField[];  // Nested fields for inline object types
  // Additional metadata from OpenAPI schema
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: string[];
}

// Enum member for enum definitions
export interface IrEnumMember {
  name: string;
  value?: unknown;
}

// Class kind: interface, enum, typeAlias, or class
export type ClassKind = 'interface' | 'enum' | 'typeAlias' | 'class';

// Intermediate Representation (IR) class definition for code generation
export interface IrClassDefinition {
  name: string;
  kind: ClassKind;
  comment?: string;
  fields?: IrField[];
  members?: IrEnumMember[];
  generics?: string[];
  extends?: string[];
  default?: unknown;
  typeSchema?: unknown; // For typeAlias, keep the original schema
}

// IR class JSON structure (output format)
export interface IrClassJson {
  classes: IrClassDefinition[];
}

// Flexible schema interface for processing - handles various spec structures
export interface SchemaLike {
  type?: string;
  properties?: Record<string, SchemaLike>;
  items?: SchemaLike;
  $ref?: string;
  description?: string;
  required?: string[];
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  format?: string;
}

// ExtendedSpec for accessing components.schemas
export interface ExtendedSpec extends OpenApiSpec {
  components?: {
    schemas?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Generate IR class definitions for a single endpoint. Thin wrapper over
 * generateIrClassForEndpoints so the multi-endpoint aggregation logic lives in
 * one place.
 */
export function generateIrClass(endpoint: Endpoint, spec: OpenApiSpec): IrClassJson {
  return generateIrClassForEndpoints([endpoint], spec);
}

/**
 * Generate IR class definitions across many endpoints, deduping shared model
 * classes by name. Schema classes (from components.schemas) are generated once;
 * each endpoint contributes its own response-type interface and inline object
 * interfaces.
 */
export function generateIrClassForEndpoints(endpoints: Endpoint[], spec: OpenApiSpec): IrClassJson {
  const classes: IrClassDefinition[] = [];

  // Cast to extended spec for schemas access
  const extendedSpec = spec as ExtendedSpec;
  const components = extendedSpec.components || {};
  const schemas = (components as { schemas?: Record<string, unknown> }).schemas || {};
  const allSchemas = schemas as Record<string, SchemaLike>;

  // Aggregate all needed types across every endpoint (request + response),
  // including transitive references.
  const neededTypes = new Set<string>();
  for (const ep of endpoints) {
    for (const typeName of collectNeededTypes(ep.requestBodySchema, ep.responseSchema)) {
      neededTypes.add(typeName);
    }
  }

  // Iteratively expand neededTypes to include all transitive references
  let changed = true;
  while (changed) {
    changed = false;
    for (const typeName of Array.from(neededTypes)) {
      if (allSchemas[typeName]) {
        const nestedRefs = collectNeededTypesFromSchema(allSchemas[typeName]);
        for (const refType of nestedRefs) {
          if (!neededTypes.has(refType)) {
            neededTypes.add(refType);
            changed = true;
          }
        }
      }
    }
  }

  // Generate schema classes once (Object.entries naturally dedupes by name)
  for (const [typeName, schema] of Object.entries(allSchemas)) {
    if (neededTypes.has(typeName)) {
      const classDef = convertSchemaToIrClass(typeName, schema as SchemaLike);
      if (classDef) {
        classes.push(classDef);
      }
    }
  }

  // Per-endpoint: response-type interface + inline object interfaces
  for (const ep of endpoints) {
    const responseTypeDef = generateResponseTypeInterface(ep);
    if (responseTypeDef) {
      classes.push(responseTypeDef);
    }

    const inlineObjects = collectInlineObjectSchemas(ep.responseSchema, 'response');
    const interfaceMap = new Map<SchemaLike, string>();

    // First pass: collect ALL inline objects and their names
    for (const inlineObj of inlineObjects) {
      const name = generateUniqueName(inlineObj.schema, classes, inlineObj.path);
      interfaceMap.set(inlineObj.schema, name);
    }

    // Second pass: generate interfaces for ALL inline objects
    for (const inlineObj of inlineObjects) {
      const name = interfaceMap.get(inlineObj.schema)!;
      const classDef = convertSchemaToIrClass(name, inlineObj.schema, interfaceMap);
      if (classDef) {
        classes.push(classDef);
      }
    }
  }

  return { classes };
}

// Generate a unique name for inline objects
function generateUniqueName(schema: SchemaLike, existingClasses: IrClassDefinition[], path?: string): string {
  // Use first property name for all objects (most intuitive)
  if (schema.properties) {
    const propNames = Object.keys(schema.properties);
    if (propNames.length > 0) {
      const baseName = propNames[0].charAt(0).toUpperCase() + propNames[0].slice(1);
      let name = baseName;
      let counter = 1;
      while (existingClasses.some(c => c.name === name)) {
        name = `${baseName}${counter}`;
        counter++;
      }
      return name;
    }
  }
  
  // Fallback to path-based naming
  if (path) {
    const parts = path.split('.');
    const lastPart = parts[parts.length - 1];
    const baseName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
    let name = baseName;
    let counter = 1;
    while (existingClasses.some(c => c.name === name)) {
      name = `${baseName}${counter}`;
      counter++;
    }
    return name;
  }
  
  // Generic unique name
  let name = 'Object';
  let counter = 1;
  while (existingClasses.some(c => c.name === name)) {
    name = `Object${counter}`;
    counter++;
  }
  return name;
}

/**
 * Generate response type interface based on endpoint's response schema
 */
function generateResponseTypeInterface(endpoint: Endpoint): IrClassDefinition | null {
  // Only generate if we have a response schema with data property
  const respSchema = endpoint.responseSchema as SchemaLike | undefined;
  if (!respSchema || !respSchema.properties?.data) {
    return null;
  }

  const dataSchema = respSchema.properties.data;
  if (!dataSchema || typeof dataSchema !== 'object') {
    return null;
  }

  // Check for type property safely
  if (!('type' in dataSchema) || dataSchema.type !== 'object') {
    return null;
  }

  // Derive response type name from operationId or endpointName
  let interfaceName: string;
  if (endpoint.operationId) {
    const baseName = endpoint.operationId
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      .replace(/^([a-z])/g, (m: string) => m.toUpperCase());
    interfaceName = `${baseName}Response`;
  } else {
    const baseName = endpoint.endpointName.charAt(0).toUpperCase() + endpoint.endpointName.slice(1);
    interfaceName = `${baseName}Response`;
  }

  // Build fields from dataSchema.properties
  const fields: IrField[] = [];
  if ('properties' in dataSchema && dataSchema.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(dataSchema.properties)) {
      if (!fieldSchema || typeof fieldSchema !== 'object') continue;

      // Use the same type extraction logic
      const type = extractFieldType(fieldSchema as SchemaLike);

      let isRequired = false;
      if ('required' in dataSchema && Array.isArray(dataSchema.required)) {
        isRequired = dataSchema.required.includes(fieldName);
      }

      // Access description safely using type assertion
      const comment = (fieldSchema as { description?: string }).description || undefined;

      fields.push({
        name: fieldName,
        type: type,
        required: isRequired,
        comment: comment,
      });
    }
  }

  return {
    name: interfaceName,
    kind: 'interface',
    comment: `Response data structure for ${endpoint.operationId || endpoint.endpointName}`,
    fields: fields,
  };
}

function convertSchemaToIrClass(name: string, schema: SchemaLike, interfaceMap?: Map<SchemaLike, string>): IrClassDefinition | null {
  // Determine kind based on schema structure
  const kind = determineClassKind(schema);

  // Build class definition with proper typing
  const classDef: Partial<IrClassDefinition> & { fields?: IrField[]; members?: IrEnumMember[] } = {
    name: name,
    kind: kind,
    comment: schema.description || undefined,
  };

  // Process based on kind
  if (kind === 'interface' || kind === 'class') {
    classDef.fields = convertFields(schema.properties, schema.required, interfaceMap);
  } else if (kind === 'enum') {
    classDef.members = convertEnumMembers(schema.enum);
  } else if (kind === 'typeAlias') {
    // For type aliases, store the original schema
    classDef.typeSchema = schema;
  }

  return classDef as IrClassDefinition;
}

function determineClassKind(schema: SchemaLike): ClassKind {
  if (schema.enum && Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (schema.type === 'object' || !schema.type) {
    return 'interface';
  }
  if (schema.type === 'string' && schema.enum) {
    return 'enum';
  }
  // Handle primitive scalar types as type aliases
  if (['string', 'number', 'integer', 'boolean'].includes(schema.type || '')) {
    return 'typeAlias';
  }
  return 'interface';
}

function convertFields(properties: Record<string, unknown> | undefined, required: string[] | undefined, interfaceMap?: Map<SchemaLike, string>): IrField[] {
  const fields: IrField[] = [];

  if (!properties || typeof properties !== 'object') return fields;

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (!fieldSchema || typeof fieldSchema !== 'object') continue;

    const isRequired = required && required.includes(fieldName) ? true : false;

    // Cast to SchemaLike for type checking
    const schema = fieldSchema as SchemaLike;

    // Check if this is an inline object schema that should become nested fields
    const isInlineObject = 
      !interfaceMap?.has(schema) &&
      (schema.type === 'object' || schema.properties);

    let type: string;
    let nestedFields: IrField[] | undefined;

    if (isInlineObject) {
      // For inline objects, use "object" type and create nested fields
      type = "object";
      nestedFields = convertFields(
        schema.properties,
        schema.required,
        interfaceMap
      );
    } else {
      // For referenced types or primitives, use the extracted type
      if (interfaceMap && interfaceMap.has(schema)) {
        type = interfaceMap.get(schema)!;
      } else {
        type = extractFieldType(schema);
      }
    }

    const field: IrField = {
      name: fieldName,
      type: type,
      required: isRequired,
      comment: schema.description || undefined,
      // Preserve metadata from OpenAPI schema
      minimum: (schema as any).minimum,
      maximum: (schema as any).maximum,
      minLength: (schema as any).minLength,
      maxLength: (schema as any).maxLength,
      pattern: (schema as any).pattern,
      format: (schema as any).format,
      enum: schema.enum ? (schema.enum as string[]) : undefined,
    };

    if (nestedFields) {
      field.fields = nestedFields;
    }

    fields.push(field);
  }

  return fields;
}

/**
 * Extract the TypeScript type for a field schema
 */
function extractFieldType(schema: SchemaLike): string {
  // Handle $ref - extract type name from path
  if (schema.$ref && typeof schema.$ref === 'string') {
    const parts = schema.$ref.split('/');
    return parts[parts.length - 1]; // Last part is the type name
  }

  // Handle primitive types
  if (schema.type) {
    switch (schema.type) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'integer': return 'number'; // integer is a subset of number
      case 'boolean': return 'boolean';
      case 'array':
        // For arrays, try to infer item type
        if (schema.items) {
          const itemType = extractFieldType(schema.items as SchemaLike);
          return `Array<${itemType}>`;
        }
        return 'Array<unknown>'; // Fallback
      case 'object':
        // For objects with properties, generate inline type
        if (schema.properties) {
          return generateInlineObjectType(schema.properties);
        }
        return 'object';
      default: return 'unknown';
    }
  }

  // If schema is just an object with properties but no type,
  // it's likely an inline definition - generate inline type
  if (schema.properties) {
    return generateInlineObjectType(schema.properties);
  }

  return 'unknown';
}

/**
 * Generate an inline TypeScript object type from properties
 */
function generateInlineObjectType(properties: Record<string, SchemaLike>): string {
  const fields: string[] = [];
  for (const [key, propSchema] of Object.entries(properties)) {
    if (!propSchema || typeof propSchema !== 'object') continue;
    const type = extractFieldType(propSchema);
    fields.push(`${key}: ${type}`);
  }
  return `{ ${fields.join('; ')} }`;
}

function convertEnumMembers(enumValues: unknown[] | undefined): IrEnumMember[] {
  if (!enumValues) return [];
  return enumValues.map((value, index) => ({
    name: `VALUE_${index}`, // Simplified naming
    value: value,
  }));
}

function collectNeededTypes(requestSchema: unknown, responseSchema: unknown): Set<string> {
  const needed = new Set<string>();
  const processed = new Set<unknown>(); // Track processed objects to avoid infinite loops

  function extractRefs(obj: unknown, depth = 0) {
    if (!obj || typeof obj !== 'object') return;
    if (processed.has(obj)) return; // Avoid infinite loops with circular references
    processed.add(obj);

    // Cast to Record<string, unknown> for property access
    const objAsRecord = obj as Record<string, unknown>;

    // Extract $ref if present and convert to type name
    if ('$ref' in objAsRecord && typeof objAsRecord.$ref === 'string') {
      const refPath = objAsRecord.$ref;
      // Extract type name from path like "#/components/schemas/ShipFuel"
      const parts = refPath.split('/');
      const typeName = parts[parts.length - 1];
      if (typeName) {
        needed.add(typeName);
      }
    }

    // Recursively process all properties
    for (const key of Object.keys(objAsRecord)) {
      extractRefs(objAsRecord[key], depth + 1);
    }

    // Special handling for array items
    if ('items' in objAsRecord && objAsRecord.items && typeof objAsRecord.items === 'object') {
      extractRefs(objAsRecord.items, depth + 1);
    }

    // Handle additionalProperties
    if ('additionalProperties' in objAsRecord && objAsRecord.additionalProperties && typeof objAsRecord.additionalProperties === 'object') {
      extractRefs(objAsRecord.additionalProperties, depth + 1);
    }
  }

  if (requestSchema) extractRefs(requestSchema);
  if (responseSchema) extractRefs(responseSchema);

  return needed;
}

// Helper to collect $ref names from a single schema (for transitive closure)
function collectNeededTypesFromSchema(schema: SchemaLike): Set<string> {
  const needed = new Set<string>();
  const processed = new Set<unknown>();

  function extractRefs(obj: unknown) {
    if (!obj || typeof obj !== 'object') return;
    if (processed.has(obj)) return;
    processed.add(obj);

    if (Array.isArray(obj)) {
      for (const item of obj) {
        extractRefs(item);
      }
    } else if (typeof obj === 'object') {
      const objAsRecord = obj as Record<string, unknown>;
      if ('$ref' in objAsRecord && typeof objAsRecord.$ref === 'string') {
        const parts = objAsRecord.$ref.split('/');
        const typeName = parts[parts.length - 1];
        if (typeName) {
          needed.add(typeName);
        }
      }
      for (const key of Object.keys(objAsRecord)) {
        extractRefs(objAsRecord[key]);
      }
    }
  }

  extractRefs(schema);
  return needed;
}

// Collect inline object schemas that need interfaces generated
interface InlineObject {
  path: string; // Description of where this object appears
  schema: SchemaLike;
  depth: number;
}

function collectInlineObjectSchemas(schema: unknown, basePath = 'root'): InlineObject[] {
  const inlineObjects: InlineObject[] = [];
  const processed = new Set<unknown>();

  function traverse(obj: unknown, path: string, depth: number) {
    if (!obj || typeof obj !== 'object') return;
    if (processed.has(obj)) return;
    processed.add(obj);

    const objAsRecord = obj as Record<string, unknown>;

    // Check if this is an object schema that needs an interface
    const isObjectSchema = 
      objAsRecord.type === 'object' || 
      (objAsRecord.properties && !objAsRecord.type);

    if (isObjectSchema) {
      inlineObjects.push({
        path,
        schema: obj as SchemaLike,
        depth
      });
    }

    // Recursively process properties
    if ('properties' in objAsRecord && objAsRecord.properties) {
      for (const [key, value] of Object.entries(objAsRecord.properties)) {
        if (typeof value === 'object') {
          traverse(value, `${path}.${key}`, depth + 1);
        }
      }
    }

    // Process items in arrays
    if ('items' in objAsRecord && objAsRecord.items && typeof objAsRecord.items === 'object') {
      traverse(objAsRecord.items, `${path}.items`, depth + 1);
    }

    // Process additionalProperties
    if ('additionalProperties' in objAsRecord && objAsRecord.additionalProperties && typeof objAsRecord.additionalProperties === 'object') {
      traverse(objAsRecord.additionalProperties, `${path}.additionalProperties`, depth + 1);
    }
  }

  traverse(schema, basePath, 0);
  return inlineObjects;
}
