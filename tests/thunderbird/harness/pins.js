import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Everything this tier pins, in one file, because every one of these values is
 * a claim about the outside world that can rot without any code here changing.
 *
 * See docs/adr/0001-three-test-tiers.md for why this tier exists at all.
 */

/**
 * The floor `manifest.json` promises is `128.0`, and this is the highest build
 * on that train: `128.15.0esr` does not exist, so 128 receives no further
 * updates. Automating the floor therefore means automating a frozen build that
 * is past end of life - which is the trade the manifest's promise implies, and
 * the reason THUNDERBIRD_BINARY exists rather than a reason to move the floor.
 *
 * The tests read the major from here and compare it against the manifest, so
 * raising the floor fails the tier rather than silently testing the wrong
 * thing.
 */
export const THUNDERBIRD_VERSION = "128.14.0esr";

/**
 * `.tar.bz2`, not `.tar.xz`: the extension differs by train, and `.tar.xz` is
 * a 404 for the whole 128 series. Current ESRs ship `.tar.xz`, so a future
 * bump to this pin has to revisit the suffix and not just the number.
 */
export const THUNDERBIRD_ARCHIVE = `thunderbird-${THUNDERBIRD_VERSION}.tar.bz2`;

const THUNDERBIRD_RELEASE_URL = `https://archive.mozilla.org/pub/thunderbird/releases/${THUNDERBIRD_VERSION}`;

export const THUNDERBIRD_URL = `${THUNDERBIRD_RELEASE_URL}/linux-x86_64/en-US/${THUNDERBIRD_ARCHIVE}`;

/**
 * The checksums sit one directory above the locale directory and cover every
 * platform in the release, so the entry to look for is keyed by the archive's
 * path relative to that directory rather than by its bare name.
 */
export const THUNDERBIRD_SHA256SUMS_URL = `${THUNDERBIRD_RELEASE_URL}/SHA256SUMS`;
export const THUNDERBIRD_SHA256SUMS_ENTRY = `linux-x86_64/en-US/${THUNDERBIRD_ARCHIVE}`;

/**
 * 0.36.0, and the version is load-bearing in both directions.
 *
 * Above it: 0.37.0 changed the add-on install command to forward the archive
 * to the application as base64, and Marionette only learned to accept that
 * form well after 128. Against the pinned build, 0.37.x answers
 * `installAddon` with a bare `InvalidArgumentError` from
 * `driver.sys.mjs`, because 128 reads only a `path` parameter and finds
 * none. 0.36.0 writes the archive to a temporary file and sends that path,
 * which both 128 and current builds understand - the newer Marionette still
 * accepts `path` - so the older driver is the one that drives both.
 *
 * Below it: switching Marionette into the privileged context needs the
 * application started with system access from Firefox 138 on, and 0.36.0 is
 * the release that introduced `--allow-system-access`. 128 does not ask for
 * it, so the flag is there for the environment override; a 0.35.x driver would
 * reject the flag outright.
 *
 * Its support matrix starts at 115 ESR with no upper bound, so one driver
 * covers the floor and the current release.
 *
 * Unlike Thunderbird, geckodriver publishes no checksum file, so the digest
 * below is pinned here instead: it was taken from the release asset once and
 * is checked on every download. A mismatch means the asset changed under a
 * published tag, which is the case worth failing on.
 */
export const GECKODRIVER_VERSION = "0.36.0";

/**
 * `.tar.gz` and `linux64`, both of them the release asset's own spelling
 * rather than a name this file chose. It lives here beside the Thunderbird
 * archive because this file is the one that holds what the tier pins: built
 * inline where it is downloaded, the platform and the compression would be two
 * claims about the outside world sitting somewhere nobody looks for them.
 */
export const GECKODRIVER_ARCHIVE = `geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz`;
export const GECKODRIVER_URL = `https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/${GECKODRIVER_ARCHIVE}`;
export const GECKODRIVER_SHA256 =
  "0bde38707eb0a686a20c6bd50f4adcc7d60d4f73c60eb83ee9e0db8f65823e04";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * One ignored directory holds everything this tier downloads or generates: the
 * extracted build, the driver, the staged copy that gets installed, and one
 * profile per run. It is named in `.gitignore` and in `scripts/package.sh`'s
 * exclusion list, the second of which matters more than it looks - the archive
 * is the working tree zipped, so an unexcluded 84 MiB build would ship.
 */
export const cacheDir = path.join(repoRoot, ".thunderbird");
export const downloadDir = path.join(cacheDir, "downloads");
export const buildDir = path.join(cacheDir, `thunderbird-${THUNDERBIRD_VERSION}`);
export const geckodriverDir = path.join(cacheDir, `geckodriver-${GECKODRIVER_VERSION}`);
export const profilesDir = path.join(cacheDir, "profiles");
export const stagingDir = path.join(cacheDir, "addon");
