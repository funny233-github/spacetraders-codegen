import fs from 'fs';
import path from 'path';
import { mergeSpec } from './mergeSpec';
import { extractNavigate } from './extractNavigate';
import { generateTypesJson } from './generateTypesJson';
import { generateApiJson } from './generateApiJson';

function main() {
  const baseDir = '/workspace/api-docs';
  const outputDir = '/workspace/spacetraders-codegen/output';

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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

  // Step 3: Generate types.json
  console.log('Generating types.json...');
  const typesJson = generateTypesJson(navigateEndpoint, spec);
  fs.writeFileSync(
    path.join(outputDir, 'types.json'),
    JSON.stringify(typesJson, null, 2)
  );

  // Step 4: Generate api.json
  console.log('Generating api.json...');
  const apiJson = generateApiJson(navigateEndpoint);
  fs.writeFileSync(
    path.join(outputDir, 'api.json'),
    JSON.stringify(apiJson, null, 2)
  );

  console.log('✅ Generation complete!');
  console.log(`Output files:`);
  console.log(`  - ${outputDir}/types.json`);
  console.log(`  - ${outputDir}/api.json`);
}

main();
