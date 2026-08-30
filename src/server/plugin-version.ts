/**
 * Which release of dpm this process is.
 *
 * The database stamp records the version of the plugin that last wrote, and to write it a server
 * first has to know its own. `neighbour.js` answers an adjacent question and cannot answer this
 * one: it reads the *directory name* the plugin was loaded from, which is a version under the
 * host's cache and is the checkout's name under `--plugin-dir`. That is fine for "is there
 * something newer beside me", where a working tree honestly means could-not-check. It is not fine
 * here, because a server developing dpm still writes rows, and a stamp it declined to write would
 * leave the one database most likely to be opened by two different releases with nothing recorded.
 *
 * **So the version comes from the manifest, which is the same file in both layouts** (criterion 2).
 * The host copies the whole package into its version directory, so `<root>/package.json` is present
 * and correct under the cache and in a checkout, and it says the same thing in both. The directory
 * name is a fact about where the code was put; the manifest is a fact about what the code is.
 *
 * **Nothing here reads `process.env`** (ENVX3), for the reason `neighbour.js` states: the host
 * guarantees the plugin root in the launch arguments and guarantees nothing about the environment,
 * so a resolver depending on a variable works on the machine it was written on and resolves to
 * something else, or to nothing, everywhere else.
 *
 * **The root and the reader are both parameters**, so the resolver can be pointed at a constructed
 * layout instead of whatever happens to be installed on the author's machine (ENVX2).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { pluginRoot } from './neighbour.ts';

/** The file the version is stated in, in every layout this plugin is shipped in. */
const MANIFEST = 'package.json';

/**
 * The version this plugin declares, or `null` when it cannot be read (FR2).
 *
 * **`null` rather than a throw**, and rather than a guess. NFR2 makes a skew check that cannot
 * complete degrade to could-not-check instead of failing the call, and this is the input to two of
 * them — a resolver that threw would turn an advisory diagnostic into a broken start. A missing
 * manifest, an unreadable one, one that is not JSON, and one whose `version` is absent or is not a
 * string all arrive the same way, because a caller can do nothing different with any of them: it
 * has no version, and the sentence it composes says so.
 *
 * The caller that turns `null` into prose is Story 4's, not this one's. FR4 has the sentence
 * composed in one place, and composing half of it here would be the second place.
 *
 * @param {string} [root] The plugin directory. Defaults to the one this module was loaded from.
 * @param {(path: string, encoding: string) => string} [read] The file reader, for tests.
 * @returns {string|null}
 */
export function pluginVersion(root = pluginRoot(), read = readFileSync) {
  let manifest;

  try {
    manifest = JSON.parse(read(join(root, MANIFEST), 'utf8'));
  } catch {
    return null;
  }

  // A `version` that is absent, empty, or not a string is the same answer as no manifest at all.
  // Returning it unchecked would hand the comparison a number or an object, which `parseVersion`
  // would turn into NaN — a could-not-check dressed as a version, arriving one layer too late to
  // say which file was wrong.
  return typeof manifest?.version === 'string' && manifest.version.length > 0
    ? manifest.version
    : null;
}
