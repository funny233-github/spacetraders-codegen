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
    // Emit a class (with an is_valid() method) when the type has constraints,
    // otherwise a plain interface.
    const keyword = cls.kind === 'class' || classHasConstraints(cls) ? 'class' : 'interface';
    lines.push(`export ${keyword} ${cls.name} {`);

    for (const field of cls.fields || []) {
      lines.push(generateFieldCode(field));
    }

    const isValidMethod = generateIsValidMethod(cls);
    if (isValidMethod) {
      lines.push(isValidMethod);
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

  // Add constraint annotations (remind the user of the OpenAPI validation rules)
  for (const constraint of getFieldConstraints(field)) {
    lines.push(`${indent}/** ${constraint} */`);
  }

  return lines.join('\n');
}

/**
 * Build human-readable constraint annotations for a field, used to remind
 * consumers of the OpenAPI validation rules (minLength, maximum, format, ...).
 */
function getFieldConstraints(field: IrField): string[] {
  const comments: string[] = [];
  if (field.minLength !== undefined) comments.push(`minLength: ${field.minLength}`);
  if (field.maxLength !== undefined) comments.push(`maxLength: ${field.maxLength}`);
  if (field.minimum !== undefined) comments.push(`minimum: ${field.minimum}`);
  if (field.maximum !== undefined) comments.push(`maximum: ${field.maximum}`);
  if (field.pattern !== undefined) comments.push(`pattern: ${field.pattern}`);
  if (field.format !== undefined) comments.push(`format: ${field.format}`);
  if (field.enum) comments.push(`enum: ${field.enum.join(' | ')}`);
  return comments;
}

/** Whether a field (recursively) carries any constraint metadata. */
function fieldHasConstraints(field: IrField): boolean {
  return (
    field.minLength !== undefined ||
    field.maxLength !== undefined ||
    field.minimum !== undefined ||
    field.maximum !== undefined ||
    field.pattern !== undefined ||
    field.format !== undefined ||
    field.enum !== undefined ||
    (field.fields ? field.fields.some(fieldHasConstraints) : false)
  );
}

/** Whether an object type carries any constraint metadata (and needs is_valid()). */
export function classHasConstraints(cls: IrClassDefinition): boolean {
  return (cls.fields && cls.fields.some(fieldHasConstraints)) || false;
}

/** Names of object types that get an is_valid() method. */
export function getValidatedTypeNames(classes: IrClassDefinition[]): Set<string> {
  const names = new Set<string>();
  for (const cls of classes) {
    if ((cls.kind === 'interface' || cls.kind === 'class') && classHasConstraints(cls)) {
      names.add(cls.name);
    }
  }
  return names;
}

/**
 * Collect `if (...) throw` statements for a field's constraints.
 * `expr` is the TypeScript expression to check (e.g. `this.symbol`),
 * `pathLabel` is a dotted path used in error messages (e.g. `symbol`).
 */
function collectFieldChecks(
  field: IrField,
  expr: string,
  pathLabel: string,
  className: string,
  indent: string,
  out: string[],
): void {
  // Optional fields are only checked when present, so guard each condition.
  const optionalGuard = !field.required ? `${expr} !== undefined && ` : '';
  const push = (cond: string, msg: string): void => {
    // Parenthesize the condition when guarded, so `a && b || c` parses as
    // `a && (b || c)` instead of `(a && b) || c`.
    const wrapped = optionalGuard ? `(${cond})` : cond;
    out.push(`${indent}if (${optionalGuard}${wrapped}) {`);
    out.push(`${indent}  throw new Error('${className}.${pathLabel}: ${msg}');`);
    out.push(`${indent}}`);
  };

  if (field.minLength !== undefined) {
    push(`typeof ${expr} !== 'string' || ${expr}.length < ${field.minLength}`, `expected string with minLength ${field.minLength}`);
  }
  if (field.maxLength !== undefined) {
    push(`typeof ${expr} !== 'string' || ${expr}.length > ${field.maxLength}`, `expected string with maxLength ${field.maxLength}`);
  }
  if (field.minimum !== undefined) {
    push(`typeof ${expr} !== 'number' || ${expr} < ${field.minimum}`, `expected number >= ${field.minimum}`);
  }
  if (field.maximum !== undefined) {
    push(`typeof ${expr} !== 'number' || ${expr} > ${field.maximum}`, `expected number <= ${field.maximum}`);
  }
  if (field.pattern !== undefined) {
    push(`typeof ${expr} !== 'string' || !/${field.pattern}/.test(${expr})`, `expected to match pattern ${field.pattern}`);
  }
  if (field.format === 'int32' || field.format === 'int64') {
    push(`typeof ${expr} !== 'number' || !Number.isInteger(${expr})`, 'expected integer');
  }
  if (field.enum) {
    const literals = field.enum.map(v => JSON.stringify(v)).join(', ');
    push(`![${literals}].includes(${expr} as any)`, `expected one of ${field.enum.join(', ')}`);
  }
  if (field.fields) {
    for (const child of field.fields) {
      collectFieldChecks(child, `${expr}.${child.name}`, `${pathLabel}.${child.name}`, className, indent + '  ', out);
    }
  }
}

/** Generate the `is_valid()` method for a constrained object type (or null). */
function generateIsValidMethod(cls: IrClassDefinition): string | null {
  if (!classHasConstraints(cls)) return null;
  const checks: string[] = [];
  for (const field of cls.fields || []) {
    collectFieldChecks(field, `this.${field.name}`, field.name, cls.name, '    ', checks);
  }
  const lines: string[] = [];
  lines.push('  /** Validate this instance against its OpenAPI constraints. Throws if invalid. */');
  lines.push('  is_valid(): void {');
  for (const check of checks) {
    lines.push(check);
  }
  lines.push('  }');
  return lines.join('\n');
}
