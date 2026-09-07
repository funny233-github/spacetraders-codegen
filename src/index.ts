import fs from 'fs';
import path from 'path';
import { mergeSpec } from './mergeSpec';
import { extractEndpoint } from './extractEndpoint';
import { generateIrClass } from './generateIrClass';
import { generateIrFunction } from './generateIrFunction';
import { generateTypesFromIR } from './generateTypesFromIR';

function main() {
  // Use relative path for API docs location
  const baseDir = path.resolve('./api-docs');
  // Use relative path for output directory
  const outputDir = './target';

  // Ensure output directory exists
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (error: any) {
    console.error('Warning: Could not create output directory:', error.message);
    process.exit(1);
  }

  // Step 1: Merge spec with all models
  console.log('Merging spec and models...');
  const spec = mergeSpec(baseDir);

  // Step 2: Extract navigate endpoint (generic extraction)
  console.log('Extracting navigate endpoint...');
  const navigateEndpoint = extractEndpoint(spec, '/my/ships/{shipSymbol}/navigate', 'post');
  if (!navigateEndpoint) {
    console.error('ERROR: Could not find navigate endpoint in spec');
    process.exit(1);
  }

  // Step 3: Generate ir-class.json (type definitions)
  console.log('Generating ir-class.json...');
  const classJson = generateIrClass(navigateEndpoint, spec);
  fs.writeFileSync(
    path.join(outputDir, 'ir-class.json'),
    JSON.stringify(classJson, null, 2)
  );

  // Step 4: Generate ir-function.json (function implementation IR)
  console.log('Generating ir-function.json...');
  const functionIr = generateIrFunction(navigateEndpoint, spec);
  fs.writeFileSync(
    path.join(outputDir, 'ir-function.json'),
    JSON.stringify(functionIr, null, 2)
  );

  // Step 5: Generate TypeScript types from IR
  console.log('Generating TypeScript types...');
  const apiOutputDir = path.join(outputDir, 'spacetraders-api');
  generateTypesFromIR(
    path.join(outputDir, 'ir-class.json'),
    apiOutputDir
  );

  console.log('✅ Generation complete!');
  console.log(`Output files:`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-class.json`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-function.json`);
  console.log(`  - ${process.cwd()}/${apiOutputDir}/types.ts`);
}

main();
