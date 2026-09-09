#!/usr/bin/env node
//
// Builds the update manifest Thunderbird polls: dist/updates.json
//
// This file is generated at release time rather than committed, because every
// field in it is already known from `manifest.json` and the built archive -
// keeping a second copy in the repo would only create something to forget.
// It is published as a release asset and served from the `releases/latest`
// permalink, which is why `update_url` never has to change.
//
// Usage: node scripts/build-updates-json.mjs <path to .xpi>
//        Prints the path it wrote, the same convention as package.sh.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The shape `AddonUpdateChecker` actually parses, which is not the shape the
 * add-on's own manifest uses. Three things here are load-bearing and each one
 * fails silently if it is wrong:
 *
 * - The key is `applications`, not `browser_specific_settings`. The update
 *   parser predates the rename and never learned it; an entry using the modern
 *   name is skipped without a word.
 * - `applications` must carry a `gecko` child. An `applications: {}` is also
 *   skipped silently.
 * - There is no `strict_max_version`. Thunderbird sets
 *   `extensions.strictCompatibility = true` on release builds, so unlike
 *   Firefox it enforces the maximum - naming one would stop the update
 *   reaching every Thunderbird newer than it.
 *
 * `update_link` is pinned to the exact version's asset rather than a `latest`
 * permalink. A moving link would hand an old client the bytes of a release it
 * did not match, and would break the hash below the moment anything shipped.
 */
export function buildUpdatesManifest({ manifest, xpiFileName, sha256 }) {
  const gecko = manifest.browser_specific_settings.gecko;
  const home = manifest.homepage_url.replace(/\/+$/, "");

  return {
    addons: {
      [gecko.id]: {
        updates: [
          {
            version: manifest.version,
            update_link: `${home}/releases/download/${manifest.version}/${xpiFileName}`,
            // Optional - Gecko only demands a hash for a non-HTTPS link. It is
            // here because generating this file means the digest is free, and
            // it turns a truncated or corrupted download into a named error
            // rather than a broken install.
            update_hash: `sha256:${sha256}`,
            update_info_url: `${home}/releases/tag/${manifest.version}`,
            applications: {
              gecko: { strict_min_version: gecko.strict_min_version },
            },
          },
        ],
      },
    },
  };
}

function main() {
  const xpiPath = process.argv[2];
  if (!xpiPath) {
    console.error("usage: node scripts/build-updates-json.mjs <path to .xpi>");
    process.exit(1);
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, "manifest.json"), "utf8"),
  );
  const xpi = readFileSync(resolve(repoRoot, xpiPath));

  const updates = buildUpdatesManifest({
    manifest,
    xpiFileName: basename(xpiPath),
    sha256: createHash("sha256").update(xpi).digest("hex"),
  });

  // Written next to the archive so it never sits at the repo root, where the
  // packaging script would have to know to exclude it.
  const out = resolve(dirname(resolve(repoRoot, xpiPath)), "updates.json");
  writeFileSync(out, `${JSON.stringify(updates, null, 2)}\n`);
  console.log(`${dirname(xpiPath)}/updates.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
