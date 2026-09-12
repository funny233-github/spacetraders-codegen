import fs from "fs";
import path from "path";
import { mergeSpec } from "./mergeSpec";
import { extractEndpoints } from "./extractEndpoint";
import { generateIrClassForEndpoints } from "./generateIrClass";
import { generateIrFunctionForEndpoints } from "./generateIrFunction";
import { generateTypesFromIR } from "./generateTypesFromIR";
import { generateFunctionsFromIR } from "./generateFunctionsFromIR";

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

  // Step 3: Generate ir-class.json (type definitions, deduped across endpoints)
  console.log("Generating ir-class.json...");
  const classJson = generateIrClassForEndpoints(endpoints, spec);
  fs.writeFileSync(
    path.join(outputDir, "ir-class.json"),
    JSON.stringify(classJson, null, 2),
  );

  // Step 4: Generate ir-function.json (function implementation IR)
  console.log("Generating ir-function.json...");
  const functionIr = generateIrFunctionForEndpoints(endpoints);
  fs.writeFileSync(
    path.join(outputDir, "ir-function.json"),
    JSON.stringify(functionIr, null, 2),
  );

  // Step 5: Generate TypeScript types from IR
  console.log("Generating TypeScript types...");
  const apiOutputDir = path.join(outputDir, "spacetraders-api");
  // Clean the generated API directory so a partial-tag run (TAGS=...) is
  // self-contained and doesn't leave stale files from a previous generation.
  fs.rmSync(apiOutputDir, { recursive: true, force: true });
  fs.mkdirSync(apiOutputDir, { recursive: true });
  generateTypesFromIR(path.join(outputDir, "ir-class.json"), apiOutputDir);

  // Step 6: Generate TypeScript functions from IR (pass class IR so functions
  // can call is_valid() on validated return types)
  console.log("Generating TypeScript functions...");
  generateFunctionsFromIR(
    path.join(outputDir, "ir-function.json"),
    apiOutputDir,
    path.join(outputDir, "ir-class.json"),
  );

  console.log("✅ Generation complete!");
  console.log(`Output files:`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-class.json`);
  console.log(`  - ${process.cwd()}/${outputDir}/ir-function.json`);
  console.log(`  - ${process.cwd()}/${apiOutputDir}/types.ts`);
  // Note: Functions are now organized by tags in subdirectories
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
