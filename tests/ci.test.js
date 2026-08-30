/**
 * Epic 01-01 Story 7 — CI on Node 24, and the environment two absences need.
 *
 * Two criteria, and they are unlike each other.
 *
 * The first (ENVR7) is about a job that runs the suite, the type check and the module sweep on
 * Node 24 under plain `node`, on every push. Half of it is checkable here — the workflow says what
 * it runs, and what it runs is what a contributor runs — and half of it is only checkable by having
 * pushed, because "the run is observable in the repository's CI history" is a claim about GitHub
 * and not about this file. **That half is not asserted here and is not quietly counted as met**:
 * the suite may not reach the network (ENVX4), so a test that queried the Actions API would break a
 * restriction in order to check a requirement. It is recorded as verified against the real run
 * instead.
 *
 * The second (ENVR12) is about an *environment*. Two of this specification's restrictions are
 * absences — ENVX1 says native compilation must not be required, ENVX4 says network access must
 * not be — and neither can be shown on a machine that has a compiler and a network. What can be
 * shown here is that the environment is declared, that it starts with neither, and that the two
 * checks run **inside** it rather than beside it. The running itself happens in CI, which is the
 * whole point of the requirement: without it both would be satisfied by inspection.
 *
 * **The workflow is read as text, and the reading carries its own controls.** NFR1 leaves this
 * project with no YAML parser and no way to acquire one, so every assertion below is over the file
 * as a string — and a substring search that matched anything would pass all of them. Each reading
 * is therefore paired with a needle that is deliberately not in the file, and the job-scoping
 * helper is checked against a job name that does not exist.
 *
 * **The network probe is the exception: it is driven, not read.** `.github/network-probe.js` is the
 * control that makes ENVX4's absence mean anything in CI, and a control nobody runs is a control
 * nobody has. It is run here in all four combinations — expecting online and expecting offline,
 * against a target that answers and a target that cannot — using a `data:` URL and a closed
 * loopback port, so the suite exercises it without a packet leaving the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageManifest, withoutHashComments } from './support/sources.js';
import { runNode } from './support/run-node.js';

const ROOT = join(import.meta.dirname, '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ci.yml');
const DOCKERFILE = join(ROOT, '.github', 'isolated.Dockerfile');
const PROBE = join(ROOT, '.github', 'network-probe.js');

const workflow = () => readFileSync(WORKFLOW, 'utf8');

/**
 * One job's block, from `\n  <name>:` to the next key at the same indent.
 *
 * Scoping matters rather than being tidy: "the workflow mentions `--network none`" is true of a
 * file where the isolated job was deleted and the string survived in a comment, and "the workflow
 * runs `npm test`" is true of one where the three commands ended up in three different jobs. Both
 * readings below are about a *job*, so the text they read is a job's.
 */
function job(name) {
  const text = workflow();
  const opens = text.indexOf(`\n  ${name}:\n`);

  if (opens === -1) return null;

  const body = text.slice(opens + 1);
  const next = body.slice(1).search(/\n {2}\S/);

  return next === -1 ? body : body.slice(0, next + 1);
}

/**
 * Comment lines stripped, for the readings that are about what runs rather than what is said.
 *
 * Shared with `executables-typescript.test.js`, which sweeps the same file for transpiler flags and
 * has to skip the same prose — the workflow's comments explain that no loader is passed, and say
 * the word while doing it.
 */
const runnable = withoutHashComments;

// --- Criterion 1: the suite, the type check and the sweep, on Node 24, on every push -------------

test('the workflow runs on every push [integration]', () => {
  assert.ok(existsSync(WORKFLOW), 'ENVR7 asks for CI on every push and there is no workflow');

  const text = workflow();

  assert.ok(text.length > 500, `the workflow is ${text.length} characters, so it declares nothing`);

  // `on:` with `push:` beneath it. Read as the two lines rather than as the word "push", which
  // appears in prose and in `git push`.
  assert.match(text, /^on:\n(?:.*\n)*?\s{2}push:\s*$/m,
    'the workflow does not trigger on push, so a change can reach main unrun');

  // The control on that reading: a trigger that is not declared is not found. Without it the
  // multi-line pattern above is satisfied by any `on:` block at all.
  assert.doesNotMatch(text, /^on:\n(?:.*\n)*?\s{2}schedule:\s*$/m,
    'the trigger reading matches blocks that are not in the file');
});

test('one job runs the suite, the type check and the sweep on Node 24 [integration]', () => {
  const checks = job('checks');

  assert.ok(checks, 'there is no `checks` job, so nothing runs the three commands');

  // **All three in the same job**, because three green jobs of which one never ran the sweep look
  // exactly like three green jobs. Scoped to the block rather than to the file for that reason.
  for (const command of ['npm test', 'npm run typecheck', 'npm run modules']) {
    assert.ok(checks.includes(command), `the checks job does not run ${command}`);
  }

  // Each is a `package.json` script, so CI and a contributor run the same string. A workflow that
  // inlined the command would drift from the script silently.
  //
  // **Read as a property rather than as a list**, because the list was the thing that went stale:
  // it was written when there were three and epic 01-03 story 4 added a fourth, and a check that
  // has to be edited every time a command is added is a check that gets edited without being read.
  // What the criterion actually wants is that nothing is *declared and not run* — a script in the
  // manifest that CI never invokes is a command a contributor runs and the build does not.
  const { scripts } = packageManifest();
  const declared = Object.keys(scripts).sort();

  assert.ok(declared.length >= 3, `only ${declared.length} commands are declared`);
  assert.deepEqual(declared.filter((name) => !checks.includes(`npm run ${name}`) && name !== 'test'),
    [], 'a command package.json declares is not run by the job that runs on every push');
  assert.ok(checks.includes('npm test'), 'the suite itself is declared and not run');

  // The control on that reading: a command nobody declared is not found among the ones that are.
  assert.equal(declared.includes('lint'), false);

  // Node 24, from `.nvmrc`, so the floor is stated once. ENVR1 is the requirement; a runner set up
  // on 22 would fail on the first `.ts` import and name the wrong problem.
  assert.match(checks, /node-version-file:\s*\.nvmrc/,
    'the job does not take its node version from .nvmrc');
  assert.equal(readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim(), '24');

  // The control: a command that is not in the job is not found in it.
  assert.equal(checks.includes('npm run lint'), false,
    'the job reading matches commands that are not in it');

  // And the control on `job()` itself, which every assertion above depends on. A helper that
  // returned the whole file would satisfy all of them while scoping nothing.
  assert.equal(job('no-such-job'), null, 'the job reading finds a job that is not declared');
  assert.equal(checks.includes('isolated:'), false,
    'the checks block runs past its own job into the next one');
});

// --- Criterion 2: the disposable isolated environment ---------------------------------------------

test('the environment is declared and starts with no language toolchain [integration]', () => {
  assert.ok(existsSync(DOCKERFILE), 'ENVR12 asks for a disposable environment and none is declared');

  const image = readFileSync(DOCKERFILE, 'utf8');

  // A base with no runtime on it. **Node arrives as a tarball rather than as a `node:` base
  // image**, so "no toolchain present" is a state this file passes through rather than a claim
  // about an image that never had one.
  assert.match(image, /^FROM debian:bookworm-slim AS bare$/m,
    'the environment is not built from a base without a runtime');
  assert.doesNotMatch(runnable(image), /^FROM node:/m,
    'the environment starts from an image that already has node');

  // The two stages the two checks need: one with nothing installed, one with `npm ci` for `tsc`.
  assert.match(image, /^FROM bare AS installed$/m, 'there is no stage with the type checker in it');
  assert.match(image, /^RUN npm ci$/m, 'the installed stage installs nothing');

  // **The build refuses a base that is already equipped.** This is the control that makes every
  // "no compiler, no python" claim in CI mean something: if the base image grew one, the build
  // fails rather than the check passing for the wrong reason.
  const guarded = image.match(/for tool in ([^;]+); do/g) ?? [];

  assert.ok(guarded.length >= 2,
    'the build does not check what is absent, so the environment asserts its own emptiness');

  for (const tool of ['node', 'npm', 'python3', 'cc', 'gcc']) {
    assert.ok(guarded.some((line) => line.includes(` ${tool} `) || line.includes(` ${tool};`)),
      `nothing in the build fails if ${tool} is already present`);
  }

  // Node 24, and the same 24 the checks job runs. Two floors that can drift are one floor nobody
  // has.
  const [, version] = image.match(/^ARG NODE_VERSION=(\d+)\./m) ?? [];

  assert.equal(version, '24', 'the isolated environment installs a node other than 24');
});

test('the host install cannot reach the environment [unit]', () => {
  // Without this the clean-install check passes by having already been done — with macOS binaries,
  // inside a Linux container. It is one line in one file and it is load-bearing.
  const ignored = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  assert.ok(ignored.includes('node_modules'),
    'the build context carries the host node_modules, so nothing installs cleanly in the container');

  // `.git` is deliberately *not* excluded — the suite reads `git ls-files` and the guard commits,
  // so the history has to travel. Asserted because excluding it would look like tidying.
  assert.equal(ignored.includes('.git'), false,
    'the checkout history is excluded, and the suite cannot run without it');
});

test('both checks run inside the environment rather than beside it [integration]', () => {
  const isolated = job('isolated');

  assert.ok(isolated, 'there is no isolated job, so ENVR12 has nothing standing behind it');

  const steps = runnable(isolated);

  // ENVX1's check, in a container with no compiler and no Python: a clean install that completes
  // without reaching for a native build.
  assert.match(steps, /npm ci --foreground-scripts/,
    'the clean install is not run where an install script would be visible');
  assert.match(steps, /node-gyp/, 'nothing in the job notices a native build');

  // ENVX4's cycle, with networking genuinely off. Every step that makes an offline claim carries
  // the flag; a step that claimed it without the flag would pass on a networked runner.
  const offline = steps.split('\n').filter((line) => line.includes('docker run'));

  assert.ok(offline.length >= 3, `only ${offline.length} docker runs, so little of this is inside`);
  assert.ok(offline.some((line) => line.includes('--network none')),
    'no step runs with networking disabled, so ENVX4 is asserted rather than shown');
  assert.match(steps, /--network none[\s\S]*npm test/,
    'the suite is not run with networking disabled, so the cycle is not the offline one');

  // **The separation this criterion is about.** The ordinary job runs on the runner and the
  // isolated one runs in a container; a `docker run` appearing in `checks` would mean the two had
  // merged and neither claim was any longer about a distinct environment.
  assert.equal(job('checks').includes('docker run'), false,
    'the checks job runs containers, so there is no longer an environment separate from it');
});

// --- The control that makes the offline claim mean anything ---------------------------------------

test('the network probe answers to what it finds, both ways [integration]', async () => {
  // **A `data:` URL is a real success path with no network.** Node answers it 200 through the same
  // code path, so "the probe can succeed" is shown here rather than assumed in CI — and the suite
  // stays offline-clean, which is the restriction the probe exists to check.
  const answers = 'data:text/plain,ok';

  // **A closed port on loopback is a real failure path with no network.** Nothing listens on port
  // 1, so the connection is refused immediately rather than timing out.
  const refuses = 'http://127.0.0.1:1/';

  const run = (mode, target) => runNode([PROBE, mode, target], '', {}, { cwd: ROOT });

  const online = await run('expect-online', answers);

  assert.equal(online.code, 0, `the probe failed where the target answered:\n${online.stderr}`);
  assert.match(online.stdout, /networking is up/);

  const offline = await run('expect-offline', refuses);

  assert.equal(offline.code, 0, `the probe failed where nothing answered:\n${offline.stderr}`);
  assert.match(offline.stdout, /networking is off/);

  // **The two that must fail**, and they are the whole reason the probe is worth having. A probe
  // that reported the same verdict whatever happened would pass both assertions above.
  const wrongWayRound = await run('expect-offline', answers);

  assert.equal(wrongWayRound.code, 1,
    'the probe accepted a reachable target while expecting an unreachable one, so a --network none '
    + 'that was quietly ignored would pass');
  assert.match(wrongWayRound.stderr, /networking is up/);

  const otherWayRound = await run('expect-online', refuses);

  assert.equal(otherWayRound.code, 1,
    'the probe accepted an unreachable target while expecting a reachable one, so a probe that '
    + 'never worked would read as evidence of an offline environment');

  // A mode it does not know is an error rather than a pass, so a typo in the workflow is loud.
  const mistyped = await run('expect-nothing', answers);

  assert.equal(mistyped.code, 2, 'an unknown mode is not refused, so a typo in CI reads as a pass');
});

test('CI runs the probe both ways, so neither answer stands alone [integration]', () => {
  const isolated = runnable(job('isolated'));

  assert.match(isolated, /network-probe\.js expect-online/,
    'CI never checks that the probe can find a network, so its offline answer means nothing');
  assert.match(isolated, /--network none .*network-probe\.js expect-offline/,
    'CI never runs the probe with networking off, so nothing shows the flag was honoured');
});
