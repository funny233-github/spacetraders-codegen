import fs from 'fs';
import path from 'path';
import { IrClassJson, IrClassDefinition, IrField, SchemaLike } from './generateIrClass';

/**
 * Generate TypeScript types from IR class definitions only
 */
export function generateTypesFromIR(irClassPath: string, outputDir: string): void {
  // Read IR JSON file
  const irData: IrClassJson = JSON.parse(fs.readFileSync(irClassPath, 'utf-8'));

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate all types to a single file
  const content = generateTypesContent(irData.classes);

  // Write to output file
  const outputPath = path.join(outputDir, 'types.ts');
  fs.writeFileSync(outputPath, content, 'utf-8');

  console.log(`Generated TypeScript types: ${outputPath}`);
}

/**
 * Generate TypeScript code content from class definitions
 */
function generateTypesContent(classes: IrClassDefinition[]): string {
  const lines: string[] = [];

  // Generate all types
  for (const cls of classes) {
    const typeCode = generateTypeCode(cls);
    lines.push(typeCode);
    lines.push(''); // Empty line between types
  }

  // Add header comment
  const header = [
    '// Auto-generated TypeScript types from IR',
    '// Source: ir-class.json',
    '',
    ...lines,
  ].join('\n');

  return header;
}

/**
 * Generate TypeScript code for a single class/interface/enum/typeAlias
 */
function generateTypeCode(cls: IrClassDefinition): string {
  const lines: string[] = [];

  // Add comment if exists
  if (cls.comment) {
    lines.push(`/** ${cls.comment} */`);
  }

  // Generate enum
  if (cls.kind === 'enum') {
    lines.push(`export enum ${cls.name} {`);
    for (const member of cls.members || []) {
      lines.push(`  ${member.name} = '${member.value}',`);
    }
    lines.push('}');
  }
  // Generate type alias
  else if (cls.kind === 'typeAlias') {
    const baseType = extractBaseType(cls.typeSchema as SchemaLike);
    lines.push(`export type ${cls.name} = ${baseType};`);
  }
  // Generate interface or class
  else if (cls.kind === 'interface' || cls.kind === 'class') {
    lines.push(`export ${cls.kind === 'class' ? 'class' : 'interface'} ${cls.name} {`);

    for (const field of cls.fields || []) {
      const fieldCode = generateFieldCode(field);
      lines.push(fieldCode);
    }

    lines.push('}');
  }

  return lines.join('\n');
}

/**
 * Extract base TypeScript type from schema
 */
function extractBaseType(schema: SchemaLike): string {
  if (schema.type === 'string') {
    // Add constraints as branded type if needed
    if (schema.minLength || schema.maxLength || schema.pattern) {
      return `string & { readonly brand: unique symbol }`;
    }
    return 'string';
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }
  if (schema.type === 'boolean') {
    return 'boolean';
  }
  // Fallback to string
  return 'string';
}

/**
 * Generate TypeScript code for a single field with consistent formatting
 */
function generateFieldCode(field: IrField, indentLevel: number = 1): string {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];

  // Determine required modifier
  const requiredModifier = field.required ? '' : '?';

  // Add field comment if exists (on its own line before the field)
  if (field.comment) {
    lines.push(`${indent}/** ${field.comment} */`);
  }

  // Handle nested inline objects
  if (field.fields && field.fields.length > 0) {
    // Generate inline object type with proper formatting
    const fieldTypes = field.fields.map(f => {
      const fCode = generateFieldCode(f, indentLevel + 1);
      return fCode;
    });
    const inlineBody = fieldTypes.join('\n');
    const line = `${indent}${field.name}${requiredModifier}: {\n${inlineBody}\n${indent}};`;
    lines.push(line);
  } else {
    // Generate field signature
    const fieldName = field.name;
    const fieldType = field.type;
    const line = `${indent}${fieldName}${requiredModifier}: ${fieldType};`;
    lines.push(line);
  }

  return lines.join('\n');
}
