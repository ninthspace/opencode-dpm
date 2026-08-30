/**
 * Where this plugin is installed, and what is installed beside it.
 *
 * A running MCP server is pinned to one version for its whole life: the host expands its plugin-root
 * placeholder into the launch arguments once, at launch, and installing a newer release writes a new
 * version directory and repoints a registry without reaching into any session already running. The
 * observed cost of that was a server serving twenty hours of requests from a release two versions
 * behind the one on disk, answering every one of them normally.
 *
 * This module is the half that looks: it resolves the directory the code is running from and lists
 * what sits beside it. Deciding whether any of those names is *newer* belongs elsewhere — a resolver
 * that also compared could not be pointed at a layout without also being asked for a verdict.
 *
 * **The verdict vocabulary and the prose are `skew.js`'s**, shared with the database stamp. They
 * were here while this was the only detector; Epic 2 added the second, and a sentence about the
 * database composed in a module named for the plugin cache is one nobody would think to look for.
 *
 * **Nothing here reads `process.env`** (ENVX3). The host guarantees the plugin root in the launch
 * arguments and guarantees nothing about the process environment, so a resolver depending on a
 * variable would work on the machine it was written on and quietly resolve to the wrong directory,
 * or to none, everywhere else.
 *
 * **The root is a parameter and the reader is a parameter** (ENVX2, NFR1). Both exist so the check
 * can be pointed at a constructed layout instead of the real cache under the user's home directory,
 * and so the reads it performs can be counted rather than described. A function that reached for
 * `readdirSync` itself would be one whose "exactly one directory read" claim nothing could check.
 */

import { readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAbove, parseVersion } from './node-floor.ts';
import { SKEW, SOURCE } from './skew.ts';
import type { Skew } from './skew.ts';

/**
 * The reader the sibling walk needs, which is narrower than `readdirSync`'s own type.
 *
 * A test substitutes a function returning plain objects with an `isDirectory` method, and the real
 * `readdirSync` overload set would make that substitution impossible to type. What the walk
 * actually uses is a name and a directory test, so that is what is asked for.
 */
type DirectoryReader = (
  path: string, options: { withFileTypes: true },
) => Array<{ name: string; isDirectory: () => boolean }>;

/**
 * How far this module sits below the plugin root: `<root>/src/server/neighbour.js`.
 *
 * A constant rather than a search upward for a marker file, because a search is a second read whose
 * count depends on how deep the tree happens to be — and NFR1 is a claim about exactly how many
 * reads a report costs. Moving this file means changing this number, which is why the test asserts
 * the resolved root against a path built the same way rather than against a literal.
 */
const DEPTH_BELOW_ROOT = 3;

/**
 * The directory this plugin was loaded from.
 *
 * @param moduleUrl The URL of a module inside this plugin. Defaults to this one, which is
 *   the only value production passes; tests give it a synthetic URL to assert the arithmetic.
 * @returns An absolute path — under the host's cache it is the version directory, and under
 *   a `--plugin-dir` launch it is the working tree, which is exactly the case FR1b is about.
 */
export function pluginRoot(moduleUrl: string = import.meta.url): string {
  let directory = dirname(fileURLToPath(moduleUrl));

  for (let up = 1; up < DEPTH_BELOW_ROOT; up += 1) directory = dirname(directory);

  return directory;
}

/**
 * The names of the directories sitting beside `root`, including `root`'s own.
 *
 * One read of one directory, non-recursive, nothing written (NFR1, NFR4). Entries that are not
 * directories are dropped here rather than by the caller — a sweep marker or a lock file beside the
 * plugins is not a plugin, and leaving it in the list would push the decision into the comparison,
 * where "is this a version" and "is this even a directory" would be answered by one parse.
 *
 * @param root The plugin directory the server is running from.
 * @param read
 *   The directory reader. A parameter so a test can count the calls and see the path.
 * @returns Directory names, in the order the filesystem gave them.
 */
export function siblingNames(root: string, read: DirectoryReader = readdirSync): string[] {
  return read(dirname(root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Whether a newer version of this plugin is installed beside the one running (FR1, FR1b, FR5).
 *
 * Never throws (NFR2). Every way this can fail to reach an answer — a root whose name is not a
 * version, a parent that cannot be read, a parent holding nothing — arrives as `unknown` carrying a
 * `reason`, because the alternative is a tool call failing over a diagnostic that was only ever
 * advisory.
 *
 * @param root The plugin directory the server is running from.
 * @param read The directory reader, passed through to {@link siblingNames}.
 */
export function neighbourSkew(root: string, read: DirectoryReader = readdirSync): Skew {
  const running = basename(root);

  // Spread into every return rather than added by the caller: the source is part of what a verdict
  // *is*, and a verdict that acquired it on the way out would be one the composer could be handed
  // without it — which reads as a missing sentence table rather than as a missing field.
  const verdict = { source: SOURCE.neighbour };

  // A plugin loaded from a working tree is the ordinary case for anyone developing dpm, and its
  // directory is named for the checkout rather than for a release. That is not a failure and it is
  // not an absence of skew — it is a question this check is not in a position to answer.
  if (parseVersion(running).some((part) => !Number.isInteger(part))) {
    return { ...verdict, state: SKEW.unknown, running, reason: 'the plugin root is not a version directory' };
  }

  let names;
  try {
    names = siblingNames(root, read);
  } catch (error) {
    return {
      ...verdict,
      state: SKEW.unknown,
      running,
      reason: `the plugin cache could not be read: ${(error as Error).message}`,
    };
  }

  if (names.length === 0) {
    return { ...verdict, state: SKEW.unknown, running, reason: 'no directories sit beside the plugin root' };
  }

  // The highest sibling, not the first one above `running` — otherwise the version reported depends
  // on the order the filesystem happened to hand back.
  const newest = names.reduce((best, name) => (isAbove(name, best) ? name : best), running);

  return isAbove(newest, running)
    ? { ...verdict, state: SKEW.found, running, newest }
    : { ...verdict, state: SKEW.none, running };
}

/**
 * The skew as it stands now, resolving the plugin root at the moment of the call (FR1a).
 *
 * **What must not be cached is the answer, not the root.** The running directory is fixed for the
 * process's whole life — that pinning is the bug this spec exists for — so resolving it once would
 * be harmless. The sibling listing is the opposite: it is the only thing that changes when the
 * upgrade lands, and it lands *after* the server starts. Nothing is memoised here or above,
 * deliberately, and the test that holds that open memoises a copy and watches it go stale.
 *
 * The entry point earns its place by leaving a reporter nothing to decide. A caller handed
 * `neighbourSkew` has to know which of its two inputs is safe to hold; a caller handed this one
 * does not, and the safe reading is also the only one available.
 *
 * @param read The directory reader, for tests.
 */
export function currentSkew(read: DirectoryReader = readdirSync): Skew {
  return neighbourSkew(pluginRoot(), read);
}

