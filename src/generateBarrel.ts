import fs from "fs";
import path from "path";

/**
 * Generate a barrel `index.ts` at the root of the API library that re-exports
 * every shared module and every generated function.
 *
 * The generated functions live in per-tag subdirectories (`<tag>/<function>.ts`)
 * and each file exports its public symbol(s) — the function itself plus, for
 * local response types, an interface with the same intent (e.g. `WarpShip`).
 * Re-exporting them from a single barrel lets consumers write:
 *
 *   import { getSystems, AgentTokenClient, ApiError } from "spacetraders-codegen";
 *
 * rather than importing each function from a deep, tag-specific path.
 *
 * @param functionPaths relative module paths of generated functions (e.g.
 *   `["systems/getSystems", "fleet/getFleet"]`), relative to `outputDir`.
 * @param outputDir absolute path to the API library root (contains `types.ts`,
 *   `client.ts`, `errors.ts` and the per-tag directories).
 */
export function generateBarrel(
  functionPaths: string[],
  outputDir: string,
): void {
  const lines: string[] = [];

  // Shared modules are always present at the library root.
  lines.push('export * from "./types";');
  lines.push('export * from "./client";');
  lines.push('export * from "./errors";');
  lines.push("");

  // Group by tag for a stable, readable ordering.
  const byTag = new Map<string, string[]>();
  for (const rel of functionPaths) {
    const tag = rel.split("/")[0] ?? "default";
    const list = byTag.get(tag) ?? [];
    list.push(rel);
    byTag.set(tag, list);
  }

  for (const tag of [...byTag.keys()].sort()) {
    const paths = byTag.get(tag) ?? [];
    lines.push(`// ${tag}`);
    for (const rel of paths) {
      lines.push(`export * from "./${rel}";`);
    }
    lines.push("");
  }

  const outPath = path.join(outputDir, "index.ts");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`Generated barrel: ${outPath}`);
}
