/**
 * Epic 01-04 Story 2 — the documented symlink instruction points at where OpenCode puts a package
 * (FR6).
 *
 * **The instruction is extracted from the README and run, rather than transcribed here.** A test
 * that spelled the command out would assert that two strings agree — the one in this file and the
 * one in this file — and would go on passing after the README said something else. What ships is
 * what a reader types, so what ships is what is executed.
 *
 * **The package cache is built rather than found.** The real one is at
 * `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/opencode-dpm/`, which exists on a
 * machine that has installed the plugin and on no other — CI included. A test that reached for it
 * would pass here and skip there, and a skip is the shape retro 01 recorded as the worst outcome:
 * a check that reports nothing wrong because it examined nothing. So the layout recorded on the
 * epic is reproduced under a scratch `XDG_CACHE_HOME`, with this checkout's own `hooks/pre-commit`
 * at the end of it. What that tests is the instruction — its glob, its ordering, and that its
 * target comes out absolute — which is the whole of what the criterion asks and the only part a
 * test on a machine with no install could ever answer.
 *
 * The layout itself was established against a real install and is written down on epic 01-04, in
 * "Where OpenCode puts a git-installed plugin". That observation is `manual` and this is not it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { initRepository } from './support/git.js';
import { cache, follow, PACKAGES } from './support/package-cache.js';
import { ownedDirectory } from './support/scratch.js';
import { packageManifest } from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/**
 * Every `ln -s` line the README gives, in order.
 *
 * The `-f` variants are included: they are the same instruction with overwrite added, and a
 * rewrite that fixed the path in one place and not the other is exactly what this reads for.
 */
const instructions = () => [...README.matchAll(/^\s*(ln -sf? .*\.git\/hooks\/pre-commit)\s*$/gm)]
  .map(([, command]) => command.trim());

/**
 * The ones that link into an installed package, which is what this file is about.
 *
 * **The README gives one other form on purpose** — linking at a clone, for someone running DPM
 * from a working tree rather than an install — and it names a path that exists on the author's
 * machine and nowhere else. Following it here would fail for a reason that is not a defect. So it
 * is excluded by *what it names* rather than by position, and the test below asserts that the
 * excluded set is exactly that one line, so an install instruction that stopped naming the cache
 * would leave this file quietly checking four commands instead of five.
 */
const cacheInstructions = () => instructions().filter((command) => command.includes(join(...PACKAGES)));

// --- The criterion: the instruction, followed, resolves to something --------------------------

test('every documented symlink instruction resolves to an existing file [integration]', (t) => {
  const commands = cacheInstructions();

  // **Named before they are run.** An empty match list satisfies a loop that asserts nothing, and
  // the regex above is over prose that this epic is in the middle of rewriting.
  assert.equal(commands.length, 5,
    `the README gives ${commands.length} install instructions, and the reading expects five`);

  // And the one deliberately left out is the clone form, named rather than counted — so a command
  // that fell out of the filter for some other reason is reported as itself.
  assert.deepEqual(instructions().filter((command) => !commands.includes(command)),
    ['ln -s ~/src/opencode-dpm/hooks/pre-commit .git/hooks/pre-commit'],
    'the README gives a link instruction this reading neither runs nor accounts for');

  for (const command of commands) {
    const installed = cache(t);
    const project = ownedDirectory(t, 'dpm-fresh-project-');

    initRepository(project);
    follow(command, { cwd: project, cacheRoot: installed.root });

    const hook = join(project, '.git', 'hooks', 'pre-commit');

    assert.equal(lstatSync(hook).isSymbolicLink(), true, `${command} did not make a symlink`);

    // **Absolute, which is the failure the hook's own comment is about.** A symlink resolves its
    // target from the directory holding it — `.git/hooks/` — so a relative path lands two levels
    // too deep, and git skips a hook it cannot resolve silently.
    assert.equal(isAbsolute(readlinkSync(hook)), true,
      `${command} produced a relative target: ${readlinkSync(hook)}`);

    // The criterion itself. `existsSync` follows the link, so this is false for a dangling one.
    assert.equal(existsSync(hook), true, `${command} left a link to nothing`);
    assert.equal(realpathSync(hook), realpathSync(installed.hooks.at(-1)),
      `${command} linked to something other than the installed hook`);
  }
});

test('the same instruction over an empty cache leaves no working hook [integration]', (t) => {
  // **The control, and the reason the test above is about the documented path.** `ln -s` succeeds
  // against a target that does not exist, so a link is made either way; what separates the two is
  // whether it resolves. Without this, an instruction pointing somewhere else entirely would pass
  // every assertion above that does not follow the link.
  const empty = ownedDirectory(t, 'dpm-empty-cache-');
  const project = ownedDirectory(t, 'dpm-fresh-project-');

  initRepository(project);
  mkdirSync(join(empty, ...PACKAGES), { recursive: true });

  const [command] = cacheInstructions();

  try {
    follow(command, { cwd: project, cacheRoot: empty });
  } catch {
    // An unmatched glob is an error in some shells and a literal in others, and either is a
    // failure to install — which is what the assertion below reads, rather than the exit status.
  }

  assert.equal(existsSync(join(project, '.git', 'hooks', 'pre-commit')), false,
    'the instruction produced a working hook against a cache with nothing in it');
});

// --- The ordering: newest install, since the path carries no version ---------------------------

test('with two installs the instruction takes the most recent, not the first [integration]', (t) => {
  // **This is why the old `sort -V | tail -1` had to go.** Under Claude Code the path held a
  // version and sorting it picked the newest release. OpenCode names the directory for a digest of
  // the specifier, so there is no version to sort and ordering hex would order nothing. Two
  // specifiers for one repository is not hypothetical — a tag and a branch produce two installs —
  // and this asserts which of them the reader ends up linked to.
  const installed = cache(t, 2);
  const project = ownedDirectory(t, 'dpm-fresh-project-');

  initRepository(project);
  follow(cacheInstructions()[0], { cwd: project, cacheRoot: installed.root });

  const hook = join(project, '.git', 'hooks', 'pre-commit');

  assert.equal(realpathSync(hook), realpathSync(installed.hooks[1]),
    'the older install was linked, so the ordering is not by time');

  // The control on the fixture rather than on the code: the two are genuinely different paths and
  // genuinely different ages, so the assertion above distinguishes them.
  assert.notEqual(installed.hooks[0], installed.hooks[1]);
  assert.ok(lstatSync(installed.hooks[0]).mtimeMs < lstatSync(installed.hooks[1]).mtimeMs);
});

// --- The path the instruction names is the layout the epic recorded ----------------------------

test('the documented path names the package by the name package.json declares [integration]', () => {
  const { name } = packageManifest();

  // **Read from the manifest rather than written here**, because the package name is what
  // `node_modules/<name>/` is: a rename of the package moves the installed tree, and an
  // instruction still naming the old one links to nothing on the next install.
  for (const command of cacheInstructions()) {
    assert.ok(command.includes(join('node_modules', name, 'hooks', 'pre-commit')),
      `an instruction does not name node_modules/${name}: ${command}`);
    assert.ok(command.includes(join(...PACKAGES)),
      `an instruction does not name the package cache: ${command}`);

    // **The cache root is respected rather than assumed.** `~/.cache` is only the default; a
    // machine with `XDG_CACHE_HOME` set puts it elsewhere, and an instruction hard-coding the
    // default sends that reader to a directory that does not exist.
    assert.ok(command.includes('${XDG_CACHE_HOME:-$HOME/.cache}'),
      `an instruction hard-codes the cache root: ${command}`);
  }

  // And nothing is left pointing at the host this port left. `.claude` would be caught by the
  // build check for a skill body; the README is not swept by it.
  assert.doesNotMatch(README, /plugins\/cache/,
    "the README still names Claude Code's plugin cache");
});
