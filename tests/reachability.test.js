/**
 * Story 0 — the tools exist, and a session can reach them.
 *
 * Five epics built a 171-tool surface and every suite passed over it while nothing declared the
 * server that serves it. That is false-pass register #21, and its shape is worth stating because
 * it is the reason this file exists rather than another assertion inside `server.test.js`:
 * **every test that drives the server supplies the launch a session does not.** `server.test.js`,
 * `spine-integration.test.js` and `naming.test.js` each spawn `bin/dpm-mcp.ts` by path, so all
 * three keep passing with the manifest empty. A check that spawns cannot see the gap; only one
 * that reads the manifest can.
 *
 * So the first two tests below assert against `plugin.json` and drive the reading of it against
 * manifests with the declaration removed and broken — the control that makes a passing run mean
 * something, since a check that always passes is indistinguishable from one that works.
 *
 * The third is the other half of FR29. The harness dispatches `mcp__plugin_<plugin>_<server>__
 * <tool>`, so the name a skill writes is not the name the registry holds, and nothing in either
 * language makes the two agree. That is the fourth integration seam the spec names.
 *
 * **That form is the one thing here the suite cannot verify, and it was wrong for four epics.** The
 * blind spot above has a second half: a test that supplies its own launch never meets a name the
 * harness built, so the whole corpus can name a prefix no session dispatches and every check in
 * this file still passes — including the one below, which used to assert the prefix equalled
 * `mcp__` + the server key and was satisfied by two strings agreeing on the wrong rule. What can be
 * held is that the prefix is *derived* from the manifest and not transcribed beside it, which is
 * what the assertion below does now. The rule itself is external, and the comment naming its source
 * is the only place it is written down.
 *
 * **What is deliberately not here.** The name *shape* rule and the refusal of an export carrying
 * the server's own identity are `naming.test.js`'s, asserted there against the live registry and
 * the live schema. Restating them would be a second copy of a rule with one home.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { skillSource, toolNames, CALLABLE } from './support/skills.js';
import { spineTools } from '../src/tools/index.ts';

const DPM = join(import.meta.dirname, '..');
const MANIFEST = join(DPM, '.claude-plugin', 'plugin.json');

/** The server key. The harness puts it after the plugin name, not on its own — see `CALLABLE`. */
const SERVER = 'dpm';

/**
 * What is wrong with a manifest's server declaration, or nothing.
 *
 * A function rather than a run of assertions so the same reading can be driven against manifests
 * that are broken on purpose. `root` stands in for `${CLAUDE_PLUGIN_ROOT}`, which is how the
 * plugin format expresses a path inside the plugin directory.
 *
 * @param {object} manifest
 * @param {string} root
 * @returns {string[]}
 */
export function declarationProblems(manifest, root) {
  const servers = manifest.mcpServers;
  if (!servers || Object.keys(servers).length === 0) return ['no MCP server is declared'];

  const problems = [];

  for (const [name, server] of Object.entries(servers)) {
    if (!server.command) problems.push(`${name}: no command`);

    // Every path the declaration names has to exist. `command` is a bare executable here (`node`),
    // so it is the argument carrying the plugin root that names a file — which is the one that can
    // be wrong in a way nothing else notices.
    for (const argument of server.args ?? []) {
      if (!argument.includes('${CLAUDE_PLUGIN_ROOT}')) continue;

      const path = argument.replaceAll('${CLAUDE_PLUGIN_ROOT}', root);
      if (!existsSync(path)) problems.push(`${name}: ${argument} does not exist`);
    }
  }

  return problems;
}

/**
 * The marketplace catalogue, one directory above the plugin. Absent in an installed copy — the host
 * unpacks `dpm/` into a version directory and does not bring the catalogue with it — so its reading
 * is conditional below, and the control that makes the reading mean anything does not depend on it.
 */
const CATALOGUE = join(DPM, '..', '.claude-plugin', 'marketplace.json');

/** The repository README, which states dpm's version in a heading. Absent for the same reason. */
const README = join(DPM, '..', 'README.md');

/** The heading that carries it. Prose, and the only version site that is not a JSON field. */
const HEADING = /^#+ DPM — .*\(v(\d+\.\d+\.\d+)\)/m;

/**
 * Where three files disagree about which version of dpm this is, or nothing.
 *
 * **Three files state it and nothing derived one from another**, which is a shape this repository
 * has already been bitten by: `SERVER_INFO.version` in `src/server/mcp.js` was a fourth, held at
 * `0.1.0` through three releases because nothing compared it to anything. That one is fixed by
 * removing it — it reads `package.json` now — and these three cannot be, because each is read by a
 * different reader before any of dpm's code runs. `package.json` is what the server and the database
 * stamp resolve; `plugin.json` is what the harness reads to install; the catalogue entry is what it
 * reads to *find* a release. So they are compared instead.
 *
 * **The catalogue is optional and the other two are not.** A missing catalogue means this is not the
 * marketplace checkout; a missing entry in a catalogue that exists means the plugin was renamed or
 * dropped, and that is a problem rather than an absence.
 *
 * **The README is the fourth and it is prose**, which is why it is here rather than trusted to a
 * reader's eye: the release that this check was written during bumped three files and missed it, and
 * the heading is the version a person sees first. A regex over a heading is a weaker binding than a
 * JSON field and the weakness is stated rather than hidden — a heading reworded past the pattern
 * reports as *no version stated*, which is a failure and not a pass.
 *
 * @param {object} manifests `package`, `plugin`, and `catalogue`/`readme` or null.
 * @returns {string[]}
 */
export function versionProblems({ package: pkg, plugin, catalogue, readme }) {
  const problems = [];
  const stated = pkg.version;

  if (typeof stated !== 'string' || stated.length === 0) return ['package.json states no version'];
  if (plugin.version !== stated) problems.push(`plugin.json says ${plugin.version}, package.json says ${stated}`);

  if (catalogue !== null) {
    const entry = (catalogue.plugins ?? []).find(({ name }) => name === 'dpm');

    if (!entry) problems.push('the marketplace catalogue lists no dpm plugin');
    else if (entry.version !== stated) problems.push(`the catalogue says ${entry.version}, package.json says ${stated}`);
  }

  if (readme !== null) {
    const heading = readme.match(HEADING);

    if (!heading) problems.push('the README states no dpm version in a heading this can read');
    else if (heading[1] !== stated) problems.push(`the README says ${heading[1]}, package.json says ${stated}`);
  }

  return problems;
}

test('every manifest that states dpm\'s version states the same one', (t) => {
  const catalogue = existsSync(CATALOGUE) ? JSON.parse(readFileSync(CATALOGUE, 'utf8')) : null;
  const readme = existsSync(README) ? readFileSync(README, 'utf8') : null;

  const manifests = {
    package: JSON.parse(readFileSync(join(DPM, 'package.json'), 'utf8')),
    plugin: JSON.parse(readFileSync(MANIFEST, 'utf8')),
    catalogue,
    readme,
  };

  assert.deepEqual(versionProblems(manifests), []);

  // Named rather than silently skipped. A conditional read that goes quiet is how a check stops
  // checking without anyone noticing, and the control below runs either way.
  if (catalogue === null) t.diagnostic('no marketplace catalogue beside this checkout; the catalogue was not compared');
  if (readme === null) t.diagnostic('no repository README beside this checkout; the heading was not compared');

  // **The versions the harness reads are directory-shaped, and the neighbour check reads directory
  // names.** A release whose `plugin.json` lagged its `package.json` would be unpacked into a
  // directory named for one while the server inside answered with the other, and `neighbour.js`
  // would report a skew that is not one — the diagnostic firing on a correct install, which is
  // worse than the silence it was built to break.
  assert.match(manifests.package.version, /^\d+\.\d+\.\d+/, 'a version the cache can name a directory after');
});

test('a manifest left behind at a bump is reported, not passed over', () => {
  // The condition, planted. Each of these is a half-bumped release, and each is invisible from
  // inside the file that is right — which is the whole reason for a comparison rather than a rule
  // in each file.
  const pkg = { version: '9.9.9' };
  const plugin = { version: '9.9.9' };
  const catalogue = { plugins: [{ name: 'cpm', version: '3.0.0' }, { name: 'dpm', version: '9.9.9' }] };
  const readme = '# Marketplace\n\n### DPM — Data-Modelled Planning Method (v9.9.9)\n\nProse.\n';
  const whole = { package: pkg, plugin, catalogue, readme };

  assert.deepEqual(versionProblems(whole), []);

  assert.deepEqual(versionProblems({ ...whole, plugin: { version: '9.9.8' } }),
    ['plugin.json says 9.9.8, package.json says 9.9.9']);

  const stale = { plugins: [{ name: 'dpm', version: '9.9.8' }] };
  assert.deepEqual(versionProblems({ ...whole, catalogue: stale }),
    ['the catalogue says 9.9.8, package.json says 9.9.9']);

  assert.deepEqual(versionProblems({ ...whole, catalogue: { plugins: [{ name: 'cpm', version: '3.0.0' }] } }),
    ['the marketplace catalogue lists no dpm plugin']);

  // **The README half — the site this check was written without, and which the very next release
  // then missed.** Three files were bumped and the heading a reader sees first was not.
  assert.deepEqual(versionProblems({ ...whole, readme: readme.replace('9.9.9)', '9.9.8)') }),
    ['the README says 9.9.8, package.json says 9.9.9']);

  // A heading reworded past the pattern is a failure, not a quiet pass. This is the one binding
  // here that reads prose rather than a field, so it is the one that can rot without anyone
  // touching a version at all.
  assert.deepEqual(versionProblems({ ...whole, readme: '### DPM planning (0.1.0)\n' }),
    ['the README states no dpm version in a heading this can read']);

  // Several wrong at once reports each, so a run that fixes one does not go green over the rest.
  assert.equal(versionProblems({
    ...whole,
    plugin: { version: '9.9.8' },
    catalogue: stale,
    readme: readme.replace('9.9.9)', '9.9.6)'),
  }).length, 3);

  // And absent really is absent rather than empty — an empty catalogue reports a missing entry and
  // an empty README an unreadable heading, which is what the null checks distinguish.
  assert.deepEqual(versionProblems({ ...whole, catalogue: null, readme: null }), []);
  assert.deepEqual(versionProblems({ ...whole, package: { version: '' } }), ['package.json states no version']);
});

test('the plugin manifest declares a server whose entry point exists', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  assert.deepEqual(declarationProblems(manifest, DPM), []);

  // The key is half the namespace and the plugin's own name is the other half. Under Claude Code
  // that pair produced what every skill in FR25's corpus used to write, so renaming either one
  // renamed 171 tools in a single edit with no other assertion noticing.
  assert.deepEqual(Object.keys(manifest.mcpServers), [SERVER],
    'exactly one server, keyed by the name the callable form is built from');
  assert.equal(manifest.name, 'dpm', 'and the plugin name, which the callable form also carries');

  // And the prefix the corpus is read with is paired with a side that differs in kind, so only the
  // external rule makes the two equal.
  //
  // **Spelled here and computed there, which is the opposite of how this read before.** The old
  // pairing recomputed the prefix from the same manifest key it was written against, so it compared
  // one rule with itself. `CALLABLE` now reads `SERVER_NAME` from the plugin entry and this is a
  // literal; neither side recomputes the other.
  //
  // This manifest is Claude Code's and no longer names anything the corpus writes — the bodies were
  // ported to `dpm_` by epic 01-03 — which is why the pairing that used to be made against it is
  // gone rather than kept alongside.
  assert.equal(CALLABLE, 'dpm_');
});

test('a manifest missing or misnaming its server is reported, not passed over', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  // The register's own condition, planted. Each of these is a manifest that would ship a tool
  // surface no session can reach, and each has to be caught by the reading above rather than by
  // a launch — every launch in this suite is one the suite supplied.
  const { mcpServers, ...undeclared } = manifest;
  assert.deepEqual(declarationProblems(undeclared, DPM), ['no MCP server is declared']);
  assert.deepEqual(declarationProblems({ ...manifest, mcpServers: {} }, DPM),
    ['no MCP server is declared']);

  const missing = { mcpServers: { dpm: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/gone.js'] } } };
  assert.deepEqual(declarationProblems(missing, DPM), ['dpm: ${CLAUDE_PLUGIN_ROOT}/bin/gone.js does not exist']);

  assert.deepEqual(declarationProblems({ mcpServers: { dpm: { args: [] } } }, DPM), ['dpm: no command']);
});

test('the declared command starts and answers, run as the manifest writes it', async (t) => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const server = manifest.mcpServers[SERVER];

  // Assembled from the declaration rather than from a path this file knows, which is the whole
  // difference between this and the three suites that already spawn the server: those prove the
  // entry point works, this proves the thing a session is told to run is that entry point.
  const args = server.args.map((argument) => argument.replaceAll('${CLAUDE_PLUGIN_ROOT}', DPM));

  const request = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' },
  });

  const { code, stdout } = await run(server.command, args, `${request}\n`,
    { DPM_DATABASE: ':memory:' });

  assert.equal(code, 0, 'the command the manifest declares did not start');
  assert.equal(JSON.parse(stdout.trim().split('\n')[0]).result.serverInfo.name, SERVER);
});

test('every tool a skill names is the callable form of a registered tool', (t) => {
  const db = openPlanningDatabase(t);
  const registered = new Set(spineTools(db).map((tool) => tool.name));

  const skills = readdirSync(join(DPM, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.ok(skills.length > 0, 'there are skills to check');

  for (const skill of skills) {
    const source = skillSource(skill);
    const named = toolNames(source);

    assert.ok(named.length > 0, `${skill} names no tool at all — the extraction found nothing`);

    for (const name of named) {
      assert.ok(registered.has(name), `${skill} calls ${name} in callable form, which is not a tool`);
    }

    // The other direction, and the one the extraction alone cannot give: a bare exported name is
    // a call no agent can make, and it contributes nothing to `named` — so without this it reads
    // as an absence rather than as a mistake.
    //
    // **Matched inside a code span rather than anywhere in the prose**, because one exported name
    // is also an ordinary English word. A bare-word sweep would fail any skill that told an agent
    // to search the codebase, and the repair for a check like that is to delete the sentence — the
    // wrong repair. A backticked name is the corpus's own convention for naming a tool, so it is
    // where a mistake would actually appear.
    for (const registration of registered) {
      if (!source.includes(`\`${registration}\``)) continue;

      assert.fail(`${skill} writes \`${registration}\` with no callable prefix — `
        + 'the exported name is not the one the harness dispatches');
    }
  }
});

test('a story carries its planning mark as a column, and its title is untouched', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const call = handlers(tools);

  const spec = call.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = call.create_epic({ slug: 'spine', title: 'Skills: Spine', parent_id: spec.id });

  const planned = call.create_story({
    epic_id: epic.id, number: 1, title: 'Convert `epics`', position: 0, plan: 1,
  });
  const plain = call.create_story({
    epic_id: epic.id, number: 2, title: 'Convert `do`', position: 1,
  });

  assert.equal(call.read_story({ id: planned.id }).plan, 1);
  assert.equal(call.read_story({ id: plain.id }).plan, 0, 'the default is off, not absent');

  // The point of the column. CPM carries this as `[plan]` appended to the story's `##` heading and
  // parses it back off there; a title that came out of the write with a marker on it would mean
  // the parse had merely moved rather than gone.
  for (const story of [planned, plain]) {
    assert.equal(call.read_story({ id: story.id }).title, story.title);
    assert.doesNotMatch(call.read_story({ id: story.id }).title, /\[plan\]/);
  }

  assert.equal(call.update_story({ id: plain.id, plan: 1 }).plan, 1, 'a story can be marked later');
  assert.equal(call.read_story({ id: plain.id }).title, 'Convert `do`');

  // And the value is constrained at **both** layers, asserted separately because one refusal is
  // indistinguishable from the other from outside. Dropping the tool's enum leaves the column to
  // refuse; dropping the column's `CHECK` leaves the tool to. Either way a caller sees a throw
  // naming `plan`, and a single assertion would keep passing while validation quietly moved to the
  // layer AD10's seam exists to keep it off.
  assert.deepEqual(tools.find((tool) => tool.name === 'create_story').inputSchema.properties.plan.enum,
    [0, 1], 'the tool declares the permitted set, so it refuses before the write');

  assert.throws(
    () => call.create_story({ epic_id: epic.id, number: 3, title: 'X', position: 2, plan: 2 }),
    /plan/,
  );

  assert.throws(
    () => db.prepare('UPDATE story SET plan = 2 WHERE id = ?').run(planned.id),
    /CHECK/,
    'the column refuses it too, so a write reaching past the tool is still constrained',
  );
});

function run(command, args, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });

    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.resume();

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));

    child.stdin.end(input);
  });
}
