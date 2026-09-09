import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  GECKODRIVER_ARCHIVE,
  GECKODRIVER_SHA256,
  GECKODRIVER_URL,
  THUNDERBIRD_ARCHIVE,
  THUNDERBIRD_SHA256SUMS_ENTRY,
  THUNDERBIRD_SHA256SUMS_URL,
  THUNDERBIRD_URL,
  THUNDERBIRD_VERSION,
  buildDir,
  downloadDir,
  geckodriverDir,
} from "./pins.js";

const run = promisify(execFile);

/**
 * Fetching the two binaries this tier drives, and doing it idempotently: the
 * first run downloads about 90 MiB, every run after it finds the extracted
 * tree and does nothing.
 *
 * There is no dependency for this on purpose. A downloader package would be a
 * runtime dependency of the test suite for two well-known URLs, and the whole
 * shape of this repo is that a contributor installs one lockfile and starts.
 */

/**
 * The variable that points the harness at an installed Thunderbird instead of
 * the pin. Exported because the tests that cover the override assert which
 * variable was read, and reading that from here is what keeps renaming it a
 * one-line change rather than a red suite.
 */
export const THUNDERBIRD_ENV = "THUNDERBIRD_BINARY";

async function exists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function digest(file) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

async function download(url, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} answered ${response.status} ${response.statusText}`);
  }
  // Written under a partial name and moved into place, so an interrupted run
  // cannot leave a truncated archive that the next run treats as cached and
  // then fails to verify in a confusing way.
  const partial = `${target}.partial`;
  await fs.writeFile(partial, Buffer.from(await response.arrayBuffer()));
  await fs.rename(partial, target);
}

/**
 * The checksum file covers every platform in the release; the line for one
 * archive is keyed by its path relative to the release directory.
 */
async function publishedThunderbirdDigest() {
  const response = await fetch(THUNDERBIRD_SHA256SUMS_URL);
  if (!response.ok) {
    throw new Error(
      `GET ${THUNDERBIRD_SHA256SUMS_URL} answered ${response.status} ${response.statusText}`,
    );
  }
  const sums = await response.text();
  for (const line of sums.split("\n")) {
    const [sum, name] = line.trim().split(/\s+/);
    if (name === THUNDERBIRD_SHA256SUMS_ENTRY) return sum;
  }
  throw new Error(
    `${THUNDERBIRD_SHA256SUMS_URL} has no entry for ${THUNDERBIRD_SHA256SUMS_ENTRY}`,
  );
}

async function fetchVerified(url, target, expected, report) {
  if (!(await exists(target))) {
    report(`downloading ${url}`);
    await download(url, target);
  }
  const actual = await digest(target);
  if (actual !== expected) {
    // Delete it: leaving a file that failed verification in the cache means
    // the next run either re-reports the same failure against a file nobody
    // will look at, or worse, someone deletes the check instead of the file.
    await fs.rm(target, { force: true });
    throw new Error(
      `${path.basename(target)} has sha256 ${actual}, expected ${expected}`,
    );
  }
  return target;
}

/**
 * `DisableAppUpdate` is the belt to the profile's braces, and it is the
 * stronger of the two. The pref that actually stops an update,
 * `app.update.disabledForTesting`, only bites while Marionette is running, and
 * `app.update.enabled` was removed from Gecko years ago; the policy is read by
 * `Services.policies.isAllowed("appUpdate")` regardless of automation mode.
 *
 * This matters because the build is a tarball extracted into a directory the
 * user can write, which is exactly the condition under which Thunderbird
 * decides it is allowed to update itself in place.
 */
async function writePolicies(appDir) {
  const policies = path.join(appDir, "distribution", "policies.json");
  await fs.mkdir(path.dirname(policies), { recursive: true });
  await fs.writeFile(
    policies,
    `${JSON.stringify(
      { policies: { DisableAppUpdate: true, ExtensionUpdate: false } },
      null,
      2,
    )}\n`,
  );
  return policies;
}

/**
 * Both binaries arrive the same way: an archive fetched once, verified against
 * a published digest, and extracted into a directory that is only moved into
 * place when the extraction finished. The two differ in the compression flag
 * and in nothing else, so this is where that sequence lives and each caller
 * below is left holding only what is true of its own binary.
 *
 * `expectedDigest` is a function rather than a value because resolving
 * Thunderbird's costs a request: on a warm cache `probe` is already there and
 * nothing should be asked of the network at all.
 */
async function fetchArchiveInto({
  probe,
  dir,
  url,
  archive,
  expectedDigest,
  tarFlag,
  report,
}) {
  if (await exists(probe)) return probe;

  const downloaded = await fetchVerified(
    url,
    path.join(downloadDir, archive),
    await expectedDigest(),
    report,
  );
  report(`extracting ${archive}`);
  // Extracted next to the final directory and moved, for the same reason the
  // download is: a half-extracted tree must never look like a cached one.
  const partial = `${dir}.partial`;
  await fs.rm(partial, { recursive: true, force: true });
  await fs.mkdir(partial, { recursive: true });
  await run("tar", [tarFlag, downloaded, "-C", partial]);
  await fs.rename(partial, dir);
  return probe;
}

async function provisionThunderbird(report) {
  const appDir = path.join(buildDir, "thunderbird");
  const binary = await fetchArchiveInto({
    probe: path.join(appDir, "thunderbird"),
    dir: buildDir,
    url: THUNDERBIRD_URL,
    archive: THUNDERBIRD_ARCHIVE,
    expectedDigest: publishedThunderbirdDigest,
    tarFlag: "-xjf",
    report,
  });
  // Written on every run rather than only after an extraction: the build
  // survives between runs and the policy is the only thing stopping it
  // updating itself, so a cache that lost it has to get it back.
  await writePolicies(appDir);
  return binary;
}

async function provisionGeckodriver(report) {
  const driver = await fetchArchiveInto({
    probe: path.join(geckodriverDir, "geckodriver"),
    dir: geckodriverDir,
    url: GECKODRIVER_URL,
    archive: GECKODRIVER_ARCHIVE,
    expectedDigest: async () => GECKODRIVER_SHA256,
    tarFlag: "-xzf",
    report,
  });
  // Same reason as the policy file above: idempotent, and the repair path for
  // a cache that was restored without its permission bits.
  await fs.chmod(driver, 0o755);
  return driver;
}

/**
 * Where the binary under test comes from, and why. Both fields are reported
 * out so a test can assert the pin and a failure can say which build it was
 * looking at.
 */
export function resolveThunderbirdBinary() {
  const override = process.env[THUNDERBIRD_ENV];
  if (override) {
    return { binary: override, source: THUNDERBIRD_ENV, version: null };
  }
  return {
    binary: path.join(buildDir, "thunderbird", "thunderbird"),
    source: "pinned",
    version: THUNDERBIRD_VERSION,
  };
}

/**
 * Idempotent, and skipped entirely for the Thunderbird half when the
 * environment names an existing install - the point of the override is to
 * drive the build a maintainer already has, so downloading 84 MiB to ignore it
 * would defeat it. The driver is still fetched either way: the only
 * geckodriver on a typical Linux box is the Firefox snap's, which is confined
 * and cannot launch a binary outside its sandbox.
 */
export async function provision({ log = () => {} } = {}) {
  const report = (message) => log(`[thunderbird tier] ${message}`);
  const resolved = resolveThunderbirdBinary();

  if (resolved.source === THUNDERBIRD_ENV) {
    if (!(await exists(resolved.binary))) {
      throw new Error(
        `${THUNDERBIRD_ENV} is set to ${resolved.binary}, which does not exist`,
      );
    }
    report(`using ${THUNDERBIRD_ENV}=${resolved.binary}, download skipped`);
  } else {
    await provisionThunderbird(report);
  }

  const geckodriver = await provisionGeckodriver(report);
  return { thunderbird: resolved, geckodriver };
}
