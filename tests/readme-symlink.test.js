/**
 * The documented symlink instruction points at a DPM the reader actually has (FR6).
 *
 * **The instruction is extracted from the README and run, rather than transcribed here.** A test
 * that spelled the command out would assert that two strings agree — the one in this file and the
 * one in this file — and would go on passing after the README said something else. What ships is
 * what a reader types, so what ships is what is executed.
 *
 * **Written for epic 01-04 story 2 against a package cache; rewritten in 02-01 story 5 against a
 * clone.** The instructions used to glob
 * `$XDG_CACHE_HOME/opencode/packages/*​/node_modules/opencode-dpm/`, and the interesting properties
 * were the glob's ordering and that its output came out absolute. That install is gone: no runtime
 * can start DPM's server from under `node_modules`, so the README names a clone. What survives the
 * change is the property that mattered — **the target must be absolute**, because a symlink
 * resolves its target from `.git/hooks/` and git skips a hook it cannot resolve without a word.
 *
 * What is lost with the glob is worth naming rather than leaving as an absence: there is no
 * ordering left to get wrong, because a path a reader typed cannot pick the wrong install.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, lstatSync, readFileSync, readlinkSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { initRepository } from './support/git.js';
import { DOCUMENTED_CLONE, clone, follow } from './support/dpm-clone.js';
import { ownedDirectory } from './support/scratch.js';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/**
 * Every `ln -s` line the README gives, in order.
 *
 * The `-f` variants are included: they are the same instruction with overwrite added, and a
 * rewrite that fixed the path in one place and not the other is exactly what this reads for. The
 * two inside the shell functions are indented and carry `$DPM_CLONE`, so they are matched here and
 * excluded below by what they name rather than by where they sit.
 */
const instructions = () => [...README.matchAll(/^\s*(ln -sf? .*\.git\/hooks\/pre-commit)\s*$/gm)]
  .map(([, command]) => command.trim());

/** The ones a reader can run as written, which is every one naming the documented clone path. */
const literal = () => instructions().filter((command) => command.includes(DOCUMENTED_CLONE));

// --- The criterion: the instruction, followed, resolves to something ------------------------------

test('every documented symlink instruction resolves to an existing file [integration]', (t) => {
  const commands = literal();

  // **Named before they are run.** An empty match list satisfies a loop that asserts nothing, and
  // the regex above is over prose this epic rewrote.
  assert.equal(commands.length, 3,
    `the README gives ${commands.length} runnable link instructions, and the reading expects three`);

  // And the ones deliberately left out are the two inside the shell functions, named rather than
  // counted — so a command that fell out of the filter for some other reason is reported as itself.
  assert.deepEqual(instructions().filter((command) => !commands.includes(command)), [
    'ln -s "$DPM_CLONE/hooks/pre-commit" .git/hooks/pre-commit',
    'ln -sf "$DPM_CLONE/hooks/pre-commit" .git/hooks/pre-commit',
  ], 'the README gives a link instruction this reading neither runs nor accounts for');

  for (const command of commands) {
    const checkout = clone(t);
    const project = ownedDirectory(t, 'dpm-fresh-project-');

    initRepository(project);
    follow(command, { cwd: project, into: checkout.roots[0] });

    const hook = join(project, '.git', 'hooks', 'pre-commit');

    assert.equal(lstatSync(hook).isSymbolicLink(), true, `${command} did not make a symlink`);

    // **Absolute, which is the failure the hook's own comment is about.** A symlink resolves its
    // target from the directory holding it — `.git/hooks/` — so a relative path lands two levels
    // too deep, and git skips a hook it cannot resolve silently. `~` expands before `ln` sees it,
    // which is the whole reason the documented form is safe.
    assert.equal(isAbsolute(readlinkSync(hook)), true,
      `${command} produced a relative target: ${readlinkSync(hook)}`);

    // The criterion itself. `existsSync` follows the link, so this is false for a dangling one.
    assert.equal(existsSync(hook), true, `${command} left a link to nothing`);
    assert.equal(realpathSync(hook), realpathSync(checkout.hooks[0]),
      `${command} linked to something other than the clone's hook`);
  }
});

test('the same instruction against a clone that is not there leaves no working hook [integration]', (t) => {
  // **The control, and the reason the test above is about the documented path.** `ln -s` succeeds
  // against a target that does not exist, so a link is made either way; what separates the two is
  // whether it resolves. Without this, an instruction pointing somewhere else entirely would pass
  // every assertion above that does not follow the link.
  const project = ownedDirectory(t, 'dpm-fresh-project-');

  initRepository(project);

  try {
    follow(literal()[0], { cwd: project, into: join(ownedDirectory(t, 'dpm-absent-'), 'no-clone') });
  } catch {
    // `ln` against a missing directory fails in some shells and succeeds in others, and either is a
    // failure to install — which is what the assertion below reads, rather than the exit status.
  }

  assert.equal(existsSync(join(project, '.git', 'hooks', 'pre-commit')), false,
    'the instruction produced a working hook against a clone with nothing in it');
});

// --- The path the instruction names is the one Installation gives ---------------------------------

test('every link instruction names the clone the README told the reader to make [integration]', () => {
  // **Read against the install section rather than written here.** The instruction and the clone
  // command are two halves of one procedure, and a rewrite that moved one is exactly the defect
  // this reads for — a reader following both ends up with a link into a directory that is not
  // there, which git then skips in silence.
  assert.match(README, new RegExp(`git clone \\S+ ${DOCUMENTED_CLONE}`),
    'the README links against a clone path its install section never tells the reader to create');

  for (const command of literal()) {
    assert.ok(command.includes(join(DOCUMENTED_CLONE, 'hooks', 'pre-commit')),
      `an instruction does not name the documented clone's hook: ${command}`);
  }

  // The shell-function form says the path once and uses it twice, which is the point of it.
  assert.match(README, new RegExp(`DPM_CLONE=${DOCUMENTED_CLONE}`),
    'the shell functions no longer define DPM_CLONE, so the two forms can drift apart');

  // And nothing is left pointing at either install this port left behind — Claude Code's plugin
  // cache, or OpenCode's own package cache, which the install section may name in prose but which
  // no runnable line may name.
  assert.doesNotMatch(README, /plugins\/cache/, "the README still names Claude Code's plugin cache");
  assert.deepEqual(instructions().filter((command) => command.includes('opencode/packages')), [],
    'a link instruction still resolves a path out of the package cache DPM is not installed into');
});
