/**
 * Epic 01-03 Story 1 — one skill body ported, and the transition made visible.
 *
 * - "The `dpm-spec` skill is registered from the package and runs end-to-end in a scratch project,
 *   exercising its gates, its tool calls and the shared conventions file" [manual]
 * - "The rewrite pattern — ID prefix, tool naming, invocation prose — is recorded as a section on
 *   this epic before the batch pass begins" [integration]
 *
 * **The first criterion is `manual` and the run is its evidence, not this file.** It was performed
 * against `opencode2 v0.0.0-beta-18684` in a throwaway project outside the checkout: 55 skills
 * registered, 23 of them dpm's, `dpm-spec` among them with the conventions line resolved to an
 * absolute path that opens; the host's tool registry held 195 tools of which 183 carried the `dpm_`
 * prefix, and all 24 the ported body names were among them; `dpm_create_spec`, taken from that
 * registry by its dispatched id and executed, wrote a row. A test asserting any of that would be
 * asserting its own double, which is why what follows checks the artefacts instead.
 *
 * **Also not here: the diff against the released v0.7.0 body.** Reverse-substituting the prefix and
 * diffing left exactly three differing lines — the description and the two cross-references — which
 * is how task 1 knew no procedure prose was disturbed. It stays a manual check because
 * `vendoring.test.js` forbids any source from naming the marketplace checkout, and a test that
 * silently passed when the released copy was absent would be worse than no test at all.
 *
 * **And no longer here: the transition's tripwire.** While one body was ported and twenty-two were
 * not, `toolNames` had to read both prefixes, and `bodiesOnLegacyForm()` asserted against the exact
 * twenty-two was what stopped that dual-form matcher quietly accepting a body nobody had touched.
 * Story 2 emptied the list, so the constant, the alternation and the assertion came out together —
 * and what replaced them is a criterion rather than a scaffold: `skill-port.test.js` refuses any
 * body naming a Claude Code mechanism at all, which is strictly the stronger claim.
 *
 * **Nor the pilot's own `/dpm:` sweep.** It read one body and carried its own planted breaches,
 * which was the right scope while one body was ported. `skill-port.test.js` now runs that reading
 * over all twenty-three plus both shared files, with a wider pattern set and its own controls, so
 * the per-skill copy was a second place to keep in step and nothing more; the description form it
 * also checked is `skill-spec.test.js`'s, where the rest of this skill's front matter is read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPlanningDatabase } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { CALLABLE, skillSource, toolNames } from './support/skills.js';

const ROOT = join(import.meta.dirname, '..');

/** The one skill this story ported. The other twenty-two are story 2's. */
const PILOT = 'spec';

const source = () => skillSource(PILOT);

// --- Criterion 2: the pattern recorded, and recorded first ---------------------------------------

test('the rewrite pattern is on the epic, carrying the naming rule and the invocation form [integration]', () => {
  // **Read from the projection rather than from the database**, for the reason `tool-naming.test.js`
  // gives: a section recorded and never published satisfies a database read while being invisible
  // to the person rewriting the other twenty-two bodies.
  const projection = readFileSync(join(ROOT, 'docs', 'epics', '01-03-epic-skill-port.md'), 'utf8');

  assert.match(projection, /The skill rewrite pattern, established on/,
    'the epic carries no section recording the pattern');

  // Both halves of what the criterion names, because a section that recorded only the tool rename
  // would leave the batch pass guessing at the half that a wrong guess repeats twenty-two times.
  // Both ends of the rename, because a section recording only the destination leaves a reader with
  // nothing to search for. The old prefix is a literal here and nowhere else in this file — it is
  // the port's own history, and the corpus no longer contains it.
  assert.ok(projection.includes('mcp__plugin_dpm_dpm__') && projection.includes(`\`${CALLABLE}`),
    'the section does not say what the tool prefix was and what it becomes');
  assert.match(projection, /built-in `skill` tool with the registration's \*\*exact, case-sensitive id\*\*/,
    'the section does not record how a v2 skill is actually invoked');
  assert.match(projection, /Invoke with the skill tool, id "dpm-spec"/,
    'the section does not show the sentence the twenty-two descriptions become');

  // The wrong premise is written down rather than quietly dropped. Planning concluded from
  // `Skill.Info.slash` that v2 mints slash commands for skills; it does not, and a reader who
  // re-derives that conclusion re-derives the error.
  assert.match(projection, /`slash` controls whether a skill appears/,
    'the section does not record what `slash` actually does');
  assert.match(projection, /mints no `\/name` trigger/,
    'the section does not record what `slash` does not do, which is the half that misled planning');

  // And the exception, so story 2 meets it as a decision rather than as a surprise.
  assert.match(projection, /ralph-loop\.local\.md/,
    'the section does not name the one skill the pattern will not fit');
});

// --- The pilot body itself -----------------------------------------------------------------------

test('every tool the pilot names is a real registered tool, in the v2 callable form [unit]', (t) => {
  const db = openPlanningDatabase(t);
  const registered = new Set(spineTools(db).map((tool) => tool.name));
  const body = source();

  // **The rename produced names, and the question is whether they are the right ones.** A typo
  // survives a prefix replacement perfectly happily — `dpm_create_spce` is as well-formed as
  // `dpm_create_spec` — so each is resolved against the registry rather than against a pattern.
  const named = toolNames(body);

  assert.ok(named.length > 20, `the extraction found ${named.length} tools, so it read almost nothing`);

  for (const name of named) {
    assert.ok(registered.has(name), `${PILOT} names ${CALLABLE}${name}, which is not a registered tool`);
  }

  // And the extraction saw the whole body, not a prefix of it — the reading above says nothing
  // about a tool named past wherever it happened to stop.
  assert.ok(body.lastIndexOf(CALLABLE) > body.length / 2,
    'no callable name appears in the second half of the body, so the extraction read a fragment');
});

