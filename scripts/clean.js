"use strict";

/**
 * Remove build artifacts (and, with --all, node_modules for a full wipe).
 *
 *   npm run clean      # dist/ + target/ + *.tgz
 *   npm run prune      # as above, plus node_modules/
 *
 * Uses Node's fs.rmSync instead of shell `rm -rf`. The sandbox's overlay
 * filesystem can race on large directories and report ENOTEMPTY, so removal is
 * retried with backoff and falls back to clearing contents entry-by-entry when
 * a single recursive call fails.
 */
const fs = require("fs");
const path = require("path");

const all = process.argv.includes("--all");
const roots = all ? ["dist", "target", "node_modules"] : ["dist", "target"];

function clearContents(abs) {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, entry.name);
    try {
      if (entry.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
      else fs.unlinkSync(p);
    } catch {
      // Best effort; the caller retries.
    }
  }
}

function removeDir(abs) {
  const maxAttempts = 8;
  return (async () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        fs.rmSync(abs, { recursive: true, force: true });
        return;
      } catch (err) {
        if (attempt === maxAttempts - 1) throw err;
        clearContents(abs);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  })();
}

async function main() {
  for (const rel of roots) {
    const abs = path.join(__dirname, "..", rel);
    await removeDir(abs);
    console.log(`Removed ${rel}/`);
  }

  // Remove npm pack artifacts (*.tgz) from the package root.
  for (const entry of fs.readdirSync(__dirname)) {
    if (entry.endsWith(".tgz")) {
      fs.unlinkSync(path.join(__dirname, entry));
      console.log(`Removed ${entry}`);
    }
  }

  console.log(all ? "Prune complete." : "Clean complete.");
}

main().catch((err) => {
  console.error("Failed to clean:", err.message);
  process.exit(1);
});
