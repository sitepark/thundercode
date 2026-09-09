#!/usr/bin/env node
//
// Raises the version in manifest.json and prints the new one.
//
// Usage: node scripts/bump-version.mjs <major|minor|patch>
//
// This exists as a script rather than a sed expression in the release
// workflow because it is the one step that writes to `main`. A malformed
// version reaches every installed copy through the update manifest, and
// "it looked right in the YAML" is not a test.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PARTS = ["major", "minor", "patch"];

/**
 * Thunderbird compares versions with `Services.vc`, which is nsIVersionComparator
 * and understands far more than three integers. The add-on has only ever used
 * plain `major.minor.patch`, so this refuses anything else rather than trying
 * to be clever about a shape the project does not use - a suffix that survived
 * a bump would be an odd thing to discover in a release.
 */
export function nextVersion(version, part) {
  if (!PARTS.includes(part)) {
    throw new Error(`Unknown version part '${part}', expected one of ${PARTS.join(", ")}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Version '${version}' is not major.minor.patch`);
  }

  const [major, minor, patch] = version.split(".").map(Number);

  // Raising a part zeroes the ones below it: 1.4.2 with a minor bump opens
  // 1.5.0, not 1.5.2.
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  const part = process.argv[2];
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const path = resolve(repoRoot, "manifest.json");

  const source = readFileSync(path, "utf8");
  const current = JSON.parse(source).version;
  const next = nextVersion(current, part);

  // A textual replacement of the one line rather than a re-serialised object:
  // reformatting the whole manifest on every release would bury the version
  // change in noise, and the file is hand-maintained everywhere else.
  const updated = source.replace(
    `"version": "${current}"`,
    `"version": "${next}"`,
  );
  if (updated === source) {
    throw new Error(`Could not find the version line for '${current}'`);
  }

  writeFileSync(path, updated);
  console.log(next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
