import fs from 'fs';
import path from 'path';
import { IrClassJson, IrClassDefinition, IrField } from './generateIrClass';

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
 * Generate TypeScript code for a single class/interface
 */
function generateTypeCode(cls: IrClassDefinition): string {
  const lines: string[] = [];

  // Add comment if exists
  if (cls.comment) {
    lines.push(`/** ${cls.comment} */`);
  }

  // Generate interface
  if (cls.kind === 'interface' || cls.kind === 'class') {
    lines.push(`export ${cls.kind === 'class' ? 'class' : 'interface'} ${cls.name} {`);

    for (const field of cls.fields || []) {
      const fieldCode = generateFieldCode(field);
      lines.push(`  ${fieldCode}`);
    }

    lines.push('}');
  }

  return lines.join('\n');
}

/**
 * Generate TypeScript code for a single field
 */
function generateFieldCode(field: IrField): string {
  const lines: string[] = [];

  // Add field comment if exists
  if (field.comment) {
    lines.push(`  /** ${field.comment} */`);
  }

  // Determine required modifier
  const requiredModifier = field.required ? '' : '?';

  // Generate field signature
  const fieldName = field.name;
  const fieldType = field.type;
  const line = `  ${fieldName}${requiredModifier}: ${fieldType}`;

  lines.push(line);

  return lines.join('\n');
}
