/**
 * Epic 02-03 Story 4 — the whole trip, end to end: body → reference → tool → text.
 *
 * Stories 1, 2 and 3 each verified one end of it. Story 1 asked whether the tool answers a name.
 * Story 2 asked whether every body names the tool. Story 3 asked whether anything still transforms
 * a body on its way to the host. **All three passed while the trip could still be broken**, because
 * none of them ever took a name *out of a body* and put it *into the tool*. A body asking for
 * `conventions` and a tool serving `skill-conventions` satisfies every assertion in all three
 * files, and no dpm skill would ever read its conventions again.
 *
 * That is the whole of what is here: the argument is extracted from the registered body rather than
 * written down, and the answer is compared against the file on disk. Twenty-three trips, and then
 * the same twenty-three through the other of v1's two plugin protocols.
 *
 * **The two routes, and why they are the host axis this can actually check.** v1 offers an MCP
 * registry and a skill registry through different protocols, and dpm ships a module for each: the
 * callable `server` export is the only handle on `config.mcp`, and the `{id, setup}` default export
 * — the v2-shaped API v1 bundles alongside it, as `support/host-contexts.js` records — is the only
 * handle on the skill registry. Nothing forces the two to describe one installation, which is
 * exactly the divergence epic 02-01 story 5 was written to catch, and it is where a shared-document
 * surface would break silently: the skills registered from one tree, the server serving another's
 * `shared/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as tools from '../src/plugin/index.ts';
import { SERVER_NAME } from '../src/plugin/index.ts';
import skillsEntry from '../src/plugin/skills-entry.ts';
import { skillSources } from '../src/plugin/registration.ts';
import { SERVER_EXECUTABLE, SHARED_DIRECTORY, packageRoot } from '../src/plugin/root.ts';
import { sharedDocumentTools } from '../src/tools/shared.ts';
import { spineTools } from '../src/tools/index.ts';
import { registerServer, registerSkills } from './support/host-contexts.js';
import { openPlanningDatabase } from './support/planning-database.js';
import { CALLABLE, SHARED_DOCUMENT_TOOL } from './support/skills.js';

const ROOT = packageRoot();
const SHARED = join(ROOT, SHARED_DIRECTORY);

/**
 * Every shared document a body asks for, as the body asks for it.
 *
 * **The argument is read out of the prose, not supplied.** A test that called the tool with
 * `'skill-conventions'` because that is what the file is called would pass against a corpus asking
 * for something else entirely — which is the one failure the three earlier stories cannot see
 * between them.
 */
const asked = (content) => [...content.matchAll(
  new RegExp(`\`${CALLABLE}${SHARED_DOCUMENT_TOOL}\`[^\`]*\`name: "([a-z0-9-]+)"\``, 'g'),
)].map(([, name]) => name);

/** One trip: take what the body asked for, ask the tool, hand back what came out. */
const trip = ({ skill }) => asked(skill.content)
  .map((name) => ({ skill: skill.name, name, content: sharedDocumentTools()[0].handler({ name }).content }));

// --- Criterion 1: the trip completes, for all twenty-three ----------------------------------------

test('every body\'s own reference, handed to the tool, returns the document [integration]', () => {
  const sources = skillSources({});

  assert.equal(sources.length, 23, `${sources.length} skills registered, not the twenty-three on disk`);

  const trips = sources.flatMap(trip);
  const conventions = readFileSync(join(SHARED, 'skill-conventions.md'), 'utf8');

  // Every skill made at least one trip, named rather than counted — a body that asks for nothing
  // is the failure, and a total would hide it behind twenty-two that asked twice.
  assert.deepEqual(sources.filter(({ skill }) => asked(skill.content).length === 0).map(({ skill }) => skill.name),
    [], 'a registered body asks for no shared document, so it opens without its conventions');

  // And every trip came back with the file, compared against the file rather than against a
  // remembered phrase from it.
  const wrong = trips
    .filter(({ name, content }) => content !== readFileSync(join(SHARED, `${name}.md`), 'utf8'))
    .map(({ skill, name }) => `${skill} -> ${name}`);

  assert.deepEqual(wrong, [], 'a body asked for a document and the tool returned something else');

  // The conventions specifically, which is what twenty-three of the twenty-four references are for.
  const reached = trips.filter(({ content }) => content === conventions).map(({ skill }) => skill);

  assert.deepEqual([...new Set(reached)].sort(), sources.map(({ skill }) => skill.name).sort(),
    'a skill completed a trip without reaching the conventions');
});

test('control — a body asking for a document that is not there fails the trip, by skill [unit]', () => {
  // **Without this the sweep above is unfalsifiable.** Every trip succeeding is also what a reading
  // that extracted no references and called nothing produces, and the extraction is the fragile
  // half: it matches on prose, and prose gets reworded.
  const planted = { skill: { name: 'dpm-planted', content: `Call \`${CALLABLE}${SHARED_DOCUMENT_TOOL}\` with \`name: "conventions"\`.` } };

  assert.deepEqual(asked(planted.skill.content), ['conventions'],
    'the extraction did not read the argument out of the planted body');
  assert.throws(() => trip(planted), /no shared document is called 'conventions'/,
    'a body asking for a document the package does not hold completed its trip anyway');

  // The other direction: the extraction finds nothing where there is nothing, so a body that stops
  // asking is reported by the sweep above rather than silently contributing zero trips that pass.
  assert.deepEqual(asked('Follow the shared conventions at startup.'), []);
  assert.deepEqual(asked(`Call \`${CALLABLE}publish\` with \`name: "skill-conventions"\`.`), [],
    'the extraction reads an argument beside some other tool as this tool\'s');
});

// --- Criterion 2: the same trip through both of v1's protocol routes -------------------------------

test('the trip is identical through the callable route and the object route [integration]', async (t) => {
  // The object route: the skills entry, driven against the recorded nine-domain context.
  const { sources } = await registerSkills(skillsEntry);

  // The callable route: the `server` export's config hook, which is the only handle on `config.mcp`
  // and therefore the only way the shared-document tool reaches a session at all. What it registers
  // is a command, so the reading is what that command would run — the server built from this root.
  const config = await registerServer(tools, {});
  const entry = config.mcp?.[SERVER_NAME];

  assert.ok(entry, 'the callable route registered no server, so no tool of any kind reaches a session');
  assert.equal(entry.command[1], join(ROOT, SERVER_EXECUTABLE),
    'the two routes name different trees, so the skills and the shared documents are two installations');

  // **The trips, side by side.** Bodies from the object route, the tool from the registry the
  // callable route's command would build. If those two ever resolved different roots this is where
  // it shows: the bodies would ask for documents the other tree does not hold.
  const registered = spineTools(openPlanningDatabase(t))
    .find((tool) => tool.name === SHARED_DOCUMENT_TOOL);

  assert.ok(registered, `${SHARED_DOCUMENT_TOOL} is not in the registry the server builds`);

  const byRoute = sources.flatMap(({ skill }) => asked(skill.content).map((name) => ({
    skill: skill.name,
    name,
    object: sharedDocumentTools()[0].handler({ name }).content,
    callable: registered.handler({ name }).content,
  })));

  assert.ok(byRoute.length >= 24, `${byRoute.length} trips, and there are twenty-four references`);

  const diverged = byRoute
    .filter(({ object, callable }) => object !== callable)
    .map(({ skill, name }) => `${skill} -> ${name}`);

  assert.deepEqual(diverged, [], 'the two routes serve different bytes for the same document');

  // And the bytes both routes agree on are the file's. Two routes agreeing is not the same as two
  // routes being right, which is the reading epic 02-01 story 5 recorded as the one it lacked.
  const wrong = byRoute
    .filter(({ name, callable }) => callable !== readFileSync(join(SHARED, `${name}.md`), 'utf8'))
    .map(({ skill, name }) => `${skill} -> ${name}`);

  assert.deepEqual(wrong, [], 'both routes agree on text that is not what is in the package');
});

test('both documents are reached across the corpus, not just the one twenty-three ask for [integration]', () => {
  // The twenty-fourth reference is one line in one body, and a check that only ever counted trips
  // would report twenty-four successes while `status-model` went unasked and unserved.
  const wanted = new Set(skillSources({}).flatMap(({ skill }) => asked(skill.content)));

  assert.deepEqual([...wanted].sort(), ['skill-conventions', 'status-model'],
    'the corpus asks for a set of documents other than the two the package ships');

  // Each of them arrives, which closes the trip on the document rather than on the call.
  for (const name of wanted) {
    assert.equal(sharedDocumentTools()[0].handler({ name }).content,
      readFileSync(join(SHARED, `${name}.md`), 'utf8'), name);
  }
});
