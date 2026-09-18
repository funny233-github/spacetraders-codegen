"use strict";

/**
 * Remove build artifacts: the generator + compiled library (dist/), the
 * generated library source (target/), and npm pack output (*.tgz).
 *
 * Uses Node's fs.rmSync (recursive + force) instead of shell `rm -rf`, because
 * the latter can race on the sandbox's overlay filesystem and bail with
 * "Directory not empty" on large directories (e.g. fleet/).
 */
const fs = require("fs");
const path = require("path");

const roots = ["dist", "target"];
for (const rel of roots) {
  const abs = path.join(__dirname, "..", rel);
  fs.rmSync(abs, { recursive: true, force: true });
  console.log(`Removed ${rel}/`);
}

// Remove npm pack artifacts (*.tgz) from the package root.
for (const entry of fs.readdirSync(__dirname)) {
  if (entry.endsWith(".tgz")) {
    fs.unlinkSync(path.join(__dirname, entry));
    console.log(`Removed ${entry}`);
  }
}

console.log("Clean complete.");
