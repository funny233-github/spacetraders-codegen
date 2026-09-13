import fs from "fs";
import path from "path";
import { mergeSpec } from "./mergeSpec";
import { extractEndpoints } from "./extractEndpoint";
import { generateTypesFromIR } from "./generateTypesFromIR";
import { generateFunctionsFromIR } from "./generateFunctionsFromIR";
import { buildGlobalTypesIR } from "./generateGlobalTypesIR";
import { buildFunctionIR } from "./generateFunctionIR";
import { RawSchema } from "./convertSchemaToIrType";
import { IrFunctionFile } from "./irTypes";

function main() {
  // Use relative path for API docs location
  const baseDir = path.resolve("./api-docs");
  // Use relative path for output directory
  const outputDir = "./target";

  // Ensure output directory exists
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Warning: Could not create output directory:", errorMessage);
    process.exit(1);
  }

  // Step 1: Merge spec with all models
  console.log("Merging spec and models...");
  const spec = mergeSpec(baseDir);

  // Step 2: Extract endpoints and filter by tag(s).
  // TAGS env var is a comma-separated list of tag names (e.g. "Agents,Fleet").
  // When unset, every endpoint in the spec is generated.
  const tagFilter = parseTagFilter(process.env.TAGS);
  const allEndpoints = extractEndpoints(spec);
  const endpoints = tagFilter
    ? allEndpoints.filter(
        (ep) => ep.tags && ep.tags.some((t) => tagFilter.has(t)),
      )
    : allEndpoints;

  if (endpoints.length === 0) {
    console.error("ERROR: No endpoints found for the specified tags");
    process.exit(1);
  }
  console.log(
    `Extracting ${endpoints.length} endpoint(s)` +
      (tagFilter ? ` for tag(s): ${[...tagFilter].join(", ")}` : "") +
      "...",
  );

  const apiOutputDir = path.join(outputDir, "spacetraders-api");
  const irDir = path.join(outputDir, "ir");
  if (!fs.existsSync(irDir)) {
    fs.mkdirSync(irDir, { recursive: true });
  }

  // Step 3: Generate types-IR.json (global component types, deduped).
  console.log("Generating types-IR.json...");
  const componentSchemas = Object.entries(
    spec.components?.schemas || {},
  ).map(([name, schema]) => ({ name, schema: schema as RawSchema }));
  const globalTypes = buildGlobalTypesIR(componentSchemas);
  const globalIr = { types: globalTypes };
  fs.writeFileSync(
    path.join(irDir, "types-IR.json"),
    JSON.stringify(globalIr, null, 2),
  );

  // Step 4: Generate per-function IR files ({tag}/{function}-IR.json).
  console.log("Generating per-function IR files...");
  const functionIrFiles: IrFunctionFile[] = [];
  for (const endpoint of endpoints) {
    const ir = buildFunctionIR(endpoint);
    functionIrFiles.push(ir);
    const tag = ir.function.tag || "default";
    const tagIrDir = path.join(irDir, tag.toLowerCase());
    if (!fs.existsSync(tagIrDir)) {
      fs.mkdirSync(tagIrDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(tagIrDir, `${ir.function.name}-IR.json`),
      JSON.stringify(ir, null, 2),
    );
  }

  // Step 5: Clean and generate TypeScript types from IR
  console.log("Generating TypeScript types...");
  fs.rmSync(apiOutputDir, { recursive: true, force: true });
  fs.mkdirSync(apiOutputDir, { recursive: true });
  generateTypesFromIR(path.join(irDir, "types-IR.json"), apiOutputDir);

  // Step 6: Generate TypeScript functions from IR (each file carries its local
  // response type, so no class IR is needed for validation).
  console.log("Generating TypeScript functions...");
  generateFunctionsFromIR(functionIrFiles, apiOutputDir);

  console.log("✅ Generation complete!");
  console.log(`Output files:`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir/types-IR.json`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir/<tag>/<function>-IR.json`);
  console.log(`  - ${process.cwd()}/${apiOutputDir}/types.ts`);
  console.log(`  - ${process.cwd()}/${apiOutputDir}/<tag>/<functionName>.ts`);
}

main();

/**
 * Parse the TAGS env var into a set of tag names. Returns null when unset so
 * the caller can fall back to "all endpoints".
 */
function parseTagFilter(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const tags = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return null;
  return new Set(tags);
}
