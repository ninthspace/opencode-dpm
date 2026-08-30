/**
 * A built OpenCode package cache, and a way to run a README command against one.
 *
 * **The real cache is at `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/opencode-dpm/`,
 * which exists on a machine that has installed the plugin and on no other** — CI included. A test
 * reaching for it would pass here and skip there, and a skip is a check that reports nothing wrong
 * because it examined nothing. So the layout is reproduced under a scratch root instead.
 *
 * Extracted from `package-cache.test.js` when `readme-v2.test.js` needed the same fixture: two
 * files building a cache from two transcriptions of the same layout is two places to edit when the
 * layout moves, and only one of them would be edited.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { ownedDirectory } from './scratch.js';
import { packageManifest } from './sources.js';

const ROOT = join(import.meta.dirname, '..', '..');

/** Where a package lands inside a cache root, minus the per-specifier directory. */
export const PACKAGES = ['opencode', 'packages'];

/**
 * A cache root holding `count` installs of this checkout's hook, oldest first.
 *
 * The per-specifier directories are named the way a real one is — `git-` and a hex digest — but
 * nothing here depends on the digest being anything in particular, because the instruction does
 * not: it globs the level and orders by time. The mtimes are set explicitly rather than left to
 * the order of creation, since two directories made in the same second are a coin toss.
 *
 * @param {import('node:test').TestContext} t Owns the directory's removal.
 * @param {number} [count]
 * @returns {{root: string, packages: string[], hooks: string[]}}
 */
export function cache(t, count = 1) {
  const root = ownedDirectory(t, 'dpm-package-cache-');
  const hooks = [];
  const packages = [];

  for (let index = 0; index < count; index += 1) {
    const digest = String(index).repeat(64);
    const installed = join(root, ...PACKAGES, `git-${digest}`, 'node_modules', packageManifest().name);

    mkdirSync(join(installed, 'hooks'), { recursive: true });

    // The hook itself is copied from this checkout rather than invented, so the file the
    // instruction finds is the one this repository ships and a rename of it fails at the caller.
    const hook = join(installed, 'hooks', 'pre-commit');

    execFileSync('cp', ['-p', join(ROOT, 'hooks', 'pre-commit'), hook]);

    const when = new Date(Date.now() - (count - index) * 60_000);

    utimesSync(hook, when, when);
    utimesSync(installed, when, when);
    hooks.push(hook);
    packages.push(installed);
  }

  return { root, packages, hooks };
}

/**
 * Run one README command in `cwd`, with the cache root the instruction reads from.
 *
 * `-c` rather than a parsed argument list, because the instructions carry command substitution, a
 * glob and a pipe — running them any other way would be running something else.
 *
 * **The shell is a parameter because one documented block is not POSIX.** `sh` is the default and
 * the strictest thing a reader is likely to have; a caller passes `bash` for a block the README
 * addresses to an interactive shell, and says why at the call site rather than here.
 *
 * @param {string} command
 * @param {{cwd: string, cacheRoot: string, shell?: string}} where
 * @returns {string}
 */
export const follow = (command, { cwd, cacheRoot, shell = 'sh' }) => execFileSync(shell, ['-c', command], {
  cwd, encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: cacheRoot },
});
