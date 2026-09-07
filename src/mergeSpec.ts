import fs from 'fs';
import path from 'path';

interface OpenApiSpec {
  openapi?: string;
  info?: any;
  paths?: Record<string, any>;
  components?: any;
}

export function mergeSpec(baseDir: string): OpenApiSpec {
  const specPath = path.join(baseDir, 'reference/SpaceTraders.json');
  const modelsDir = path.join(baseDir, 'models');

  let spec: OpenApiSpec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

  // Load all model files and add to components.schemas
  spec.components = spec.components || {};
  spec.components.schemas = spec.components.schemas || {};

  const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.json'));
  for (const file of modelFiles) {
    const modelName = file.replace('.json', '');
    const modelPath = path.join(modelsDir, file);
    const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    spec.components.schemas[modelName] = modelData;
  }

  // Resolve all $refs to point to components.schemas
  spec = resolveRefs(spec);

  return spec;
}

function resolveRefs(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(resolveRefs);
  }

  if (typeof obj === 'object') {
    const resolved = { ...obj };

    if (obj.$ref) {
      // Simple resolution: convert ../models/Name.json to #/components/schemas/Name
      const refPath = obj.$ref.replace('../models/', '').replace('./', '');
      const modelName = refPath.replace('.json', '');
      return { '$ref': `#/components/schemas/${modelName}` };
    }

    for (const key of Object.keys(resolved)) {
      resolved[key] = resolveRefs(resolved[key]);
    }

    return resolved;
  }

  return obj;
}
