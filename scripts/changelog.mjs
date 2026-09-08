#!/usr/bin/env node
//
// Regenerates the changelog from the Conventional Commit history.
//
// Usage: node scripts/changelog.mjs [--release] [--output <path>]
//
//   (no flag)         Unreleased commits stay under `## [Unreleased]`. This is
//                     the everyday form: run it after landing work to see what
//                     the next release will say.
//   --release         Stamps those commits with the version in manifest.json
//                     and today's date. This is release prep, and it is what
//                     makes the workflow's changelog guard pass.
//   --output <path>   Defaults to CHANGELOG.md. The release workflow points it
//                     at a temporary file so it can compare the committed
//                     changelog against a freshly generated one.
//
// The version is read from manifest.json rather than passed in, for the same
// reason the release workflow reads it there: one file decides what is being
// released, and a second opinion about it is a bug waiting to happen.
//
// This exists as a script rather than a `git-cliff` line in the workflow so
// that the file CI checks and the file a developer commits are produced by the
// same code. A guard that regenerates the changelog slightly differently from
// the command in the README would fail on formatting and teach everyone to
// ignore it.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function main() {
  const argv = process.argv.slice(2);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  const outputIndex = argv.indexOf("--output");
  const output = outputIndex === -1 ? "CHANGELOG.md" : argv[outputIndex + 1];
  if (!output) {
    throw new Error("--output was given without a path");
  }

  const args = ["--config", "cliff.toml", "--output", output];

  if (argv.includes("--release")) {
    const { version } = JSON.parse(
      readFileSync(resolve(repoRoot, "manifest.json"), "utf8"),
    );
    args.push("--tag", version);
  }

  // Resolved through the package's bin, so the version in the lockfile is the
  // one that runs here and in CI. A changelog that depended on whichever
  // git-cliff happened to be on someone's PATH would reformat itself every
  // time a different machine regenerated it.
  execFileSync("git-cliff", args, { cwd: repoRoot, stdio: "inherit" });

  // git-cliff ends the file with a blank line, which is one more than a text
  // file needs and which every formatter would take back out again.
  const path = resolve(repoRoot, output);
  writeFileSync(path, readFileSync(path, "utf8").replace(/\n+$/, "\n"));
}

main();
