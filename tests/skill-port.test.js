/**
 * Epic 01-03 Story 2 — the ported corpus names no Claude Code mechanism.
 *
 * - "A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`,
 *   or `.claude/`" [unit, must_not]
 *
 * **This is the criterion that replaced story 1's transition tripwire, and it is the stronger
 * claim.** While one body was ported and twenty-two were not, `skill-pilot.test.js` asserted the
 * legacy list was exactly the twenty-two nobody had touched — a scaffold whose only job was to stop
 * a dual-form matcher quietly accepting an unported body. That list is empty now, so what stands in
 * its place is not "the ones we have not done yet" but "none of them, ever".
 *
 * **The other five criteria are read elsewhere and are not restated here**, because a second
 * assertion of the same property is a second thing to keep in step rather than a second reading.
 * The computed registration list and its `dpm-` prefix, and each skill's `location` inside the
 * package, are `plugin-entry.test.js`; the SQL prohibition with its own controls is
 * `skills-corpus.test.js`; the two `manual` criteria were the scratch-project run, whose evidence
 * is the run and not a double of it.
 *
 * **The corpus is walked, not listed.** `skillNames()` reads the tree, so a skill added tomorrow is
 * covered on the day it lands — which is the one nobody thought about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conventions, skillNames, skillSource, sweep } from './support/skills.js';

/**
 * The mechanisms a ported body may not name — **imported from the check CI runs, not restated**.
 *
 * Story 4 built `scripts/skill-body-check.ts` to fail the build on exactly this list, and two
 * copies of it would be two things to keep in step, with the copy CI ran being the one nobody
 * reads. The list carries a fifth pattern story 3 found (`$ARGUMENTS`) beyond the four story 2's
 * criterion names; that is more than the criterion asks and never less.
 */
import { HOST_MECHANISM } from '../scripts/skill-body-check.ts';

const ROOT = join(import.meta.dirname, '..');

/**
 * The one breach on the record, and the whole of it.
 *
 * `ralph` drives a loop by writing a file a **Claude Code stop hook** reads to decide whether to
 * re-enter. That hook was never shipped — not by this port and not by released v0.7.0, whose
 * `hooks/` holds a `pre-commit` and nothing else — and v2 has no equivalent, so this is a missing
 * capability rather than a path that needs rewriting. Substituting the path would satisfy the
 * criterion by hiding exactly what it was written to catch, and would leave a skill that reads as
 * ported and cannot work. Chris decided the skill stays registered and the gap goes on the record.
 *
 * **Closing the gap fails this test, and that is deliberate** — the same shape story 1's tripwire
 * had. When `ralph` learns a v2 loop mechanism, this constant comes out with it.
 */
const RECORDED_GAP = { skill: 'dpm-ralph', pattern: /`?\.claude\/ralph-loop\.local\.md`?/g, occurrences: 5 };

/** The corpus as `{name, source}`, with the recorded gap subtracted from the one body that has it. */
function bodies() {
  return skillNames().map((name) => ({
    name,
    source: name === RECORDED_GAP.skill
      ? skillSource(name).replaceAll(RECORDED_GAP.pattern, '')
      : skillSource(name),
  }));
}

test('no skill body names a Claude Code mechanism [unit]', () => {
  const corpus = bodies();

  assert.equal(corpus.length, 23, `${corpus.length} skills were enumerated from the tree`);

  const offenders = corpus
    .map(({ name, source }) => ({ name, found: sweep(source, HOST_MECHANISM) }))
    .filter(({ found }) => found.length > 0);

  assert.deepEqual(offenders, [], 'a ported skill still names a mechanism only Claude Code has');

  // The files every skill reads. No per-skill sweep reaches them, and a mechanism moved into one
  // would leave all twenty-three bodies clean while reaching every one of them at startup.
  assert.deepEqual(sweep(conventions(), HOST_MECHANISM), [],
    'the shared conventions name a mechanism only Claude Code has');
  assert.deepEqual(sweep(readFileSync(join(ROOT, 'shared', 'status-model.md'), 'utf8'), HOST_MECHANISM),
    [], 'the shared status model names a mechanism only Claude Code has');
});

test('the one recorded gap is exactly ralph, and exactly the stop-hook file [unit]', () => {
  // **Held to the full standard on everything else.** The subtraction above removes one path from
  // one body; `ralph` naming a `/dpm:` command or an `mcp__plugin_` tool fails the sweep with the
  // other twenty-two, because the exemption is a string and not a skill.
  const raw = skillSource(RECORDED_GAP.skill);
  const found = [...raw.matchAll(RECORDED_GAP.pattern)];

  assert.equal(found.length, RECORDED_GAP.occurrences,
    `${RECORDED_GAP.skill} carries ${found.length} references to the stop-hook file and the gap on `
    + `the record is ${RECORDED_GAP.occurrences} — the port's own note is out of step with the body`);

  // And it is the only body claiming one. A second skill acquiring an exemption would have to
  // acquire it here, in the open, rather than by being added to a list nobody reads.
  const claiming = skillNames().filter((name) => /\.claude\b/.test(skillSource(name)));

  assert.deepEqual(claiming, [RECORDED_GAP.skill],
    'a skill other than the one on the record names the harness directory');
});

test('the reading catches each mechanism it names, and passes their ported forms [unit]', () => {
  // **A sweep for an absence proves nothing about the sweep**, and the corpus above is clean, so
  // every pattern here is driven against prose written to trip it. One planted breach per pattern,
  // written out rather than counted, so a pattern that stopped matching is named by its failure.
  const planted = [
    'Call `mcp__plugin_dpm_dpm__list_epic` with `ready: true`.',
    'Then hand off to `/dpm:architect` with the epic reference.',
    'Read `${CLAUDE_PLUGIN_ROOT}/shared/skill-conventions.md` at startup.',
    'The progress file lives at `.claude/dpm-progress.local.md`.',
    'Open `.claude-plugin/plugin.json` and read the server key.',
  ];

  for (const breach of planted) {
    assert.ok(sweep(breach, HOST_MECHANISM).length >= 1, `the sweep passed: ${breach}`);
  }

  // The other half, and the half that decides whether this is a reading or an allow-list: the
  // ported forms of those same four sentences are not caught. A pattern broad enough to fire on
  // `dpm_list_epic` or on `dpm-architect` would report the whole corpus and be silenced.
  const ported = [
    'Call `dpm_list_epic` with `ready: true`.',
    'Then hand off to the `dpm-architect` skill with the epic reference.',
    'Read `dpm/shared/skill-conventions.md` at startup.',
    'Invoke with the skill tool, id "dpm-do".',
  ];

  for (const line of ported) {
    assert.deepEqual(sweep(line, HOST_MECHANISM), [], `the sweep caught a ported line: ${line}`);
  }
});
