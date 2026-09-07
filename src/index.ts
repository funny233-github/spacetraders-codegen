import fs from 'fs';
import path from 'path';
import { mergeSpec } from './mergeSpec';
import { extractNavigate } from './extractNavigate';
import { generateTypesJson } from './generateTypesJson';
import { generateFunctionIr } from './generateFunctionIr';

function main() {
  // Use relative path for API docs location (assumes api-docs is a submodule)
  const baseDir = path.resolve(__dirname, '../../api-docs');
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

  // Step 2: Extract navigate endpoint
  console.log('Extracting navigate endpoint...');
  const navigateEndpoint = extractNavigate(spec);
  if (!navigateEndpoint) {
    console.error('ERROR: Could not find navigate endpoint in spec');
    process.exit(1);
  }

  // Step 3: Generate ir-class.json (type definitions)
  console.log('Generating ir-class.json...');
  const classJson = generateTypesJson(navigateEndpoint, spec);
  fs.writeFileSync(
    path.join(outputDir, 'ir-class.json'),
    JSON.stringify(classJson, null, 2)
  );

  // Step 4: Generate ir-function.json (function implementation IR)
  console.log('Generating ir-function.json...');
  const functionIr = generateFunctionIr(navigateEndpoint, spec);
  fs.writeFileSync(
    path.join(outputDir, 'ir-function.json'),
    JSON.stringify(functionIr, null, 2)
  );

  console.log('✅ Generation complete!');
  console.log(`Output files:`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-class.json`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-function.json`);
}

main();
