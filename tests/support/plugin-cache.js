/**
 * A stand-in for the host's plugin cache: sibling version directories under one parent.
 *
 * The neighbour check derives the directory it is running from, reads that directory's parent, and
 * compares the sibling names it finds there (AD3). Every test of it therefore needs a parent holding
 * directories named like versions, and needs to nominate which of them the check is pretending to
 * run from.
 *
 * **It is built here rather than reached for on disk.** The real cache is
 * `~/.claude/plugins/cache/…`, and a test that read it would pass on the author's machine for
 * reasons unrelated to the code being correct — it would find whatever that machine happened to
 * have installed, and would go on passing after the code stopped working. ENVX2 is the rule; this
 * helper is what makes obeying it convenient enough that nobody reaches for the shortcut.
 *
 * **Nothing here knows what a version is.** The names are strings the caller chose, so a suite can
 * build `0.2.0` beside `0.10.0` to catch a lexical comparison, or `main` beside nothing to build the
 * working-tree case FR1b is about. Parsing belongs to the check under test, and a fixture that
 * validated its own inputs would refuse exactly the malformed layouts the check has to survive.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ownedDirectory } from './scratch.js';

/**
 * A cache directory holding one directory per name, and the path to the one being run from.
 *
 * @param {import('node:test').TestContext} t
 * @param {string[]} versions Directory names to create as siblings. Order is not significant.
 * @param {object} [options]
 * @param {string} [options.running] Which sibling the check is running from. Defaults to the last.
 * @param {string[]} [options.files] Names created as plain files rather than directories, for the
 *   case where something that is not a plugin sits beside the plugins.
 * @param {string} [options.prefix] Names the temporary directory, so an orphan is traceable.
 * @returns {{cache: string, root: string, versions: string[]}} `cache` is the parent; `root` is the
 *   directory the check is pointed at; `versions` is what was created, as given.
 */
export function pluginCache(t, versions, options = {}) {
  const { running = versions.at(-1), files = [], prefix = 'dpm-cache-' } = options;

  // **A root that is not among the siblings is refused rather than created.** Silently making the
  // directory would hand back a fixture that answers a different question from the one the caller
  // asked, and the test above it would pass without ever exercising the sibling comparison. The
  // working-tree case is built by passing a `running` that IS in `versions` and giving that
  // directory a name no version parser accepts — not by pointing at a directory that is not there.
  //
  // The empty-`versions` call is refused by the same line, and deliberately: with nothing to default
  // to, `running` is `undefined` and `join` would throw several frames further on, about a path
  // rather than about the fixture. A cache with no plugin in it is not a layout the check can be
  // pointed at — the no-other-siblings case is one version directory, which is what to pass.
  if (!versions.includes(running)) {
    throw new Error(
      `running directory ${running} is not among the siblings [${versions.join(', ')}]`,
    );
  }

  const cache = ownedDirectory(t, prefix);

  for (const name of versions) mkdirSync(join(cache, name));
  for (const name of files) writeFileSync(join(cache, name), '');

  return { cache, root: join(cache, running), versions: [...versions] };
}
