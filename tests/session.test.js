/**
 * Story 6 — the session row that replaces the progress-file subsystem (FR11).
 *
 * The criterion is one sentence with two halves: a row survives resume under a new id, and stale
 * rows are selected by age. Both are asserted against what a resume actually does rather than
 * against the statements that implement it — `UPDATE session SET superseded_by = ?` is the
 * mechanism, and a test written against the mechanism would pass just as happily if the chain it
 * builds pointed the wrong way.
 *
 * **What "survives" has to mean here.** The old subsystem's failure was not losing the file; it
 * was two files, or a file whose name no longer matched the session id, with nothing able to say
 * which was current. So the assertions are about the *chain* — one live end, the state reachable
 * from the new id, and a second adoption of the same predecessor refused rather than silently
 * re-pointed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';

/** Sessions are stamped by the server clock, and staleness is measured from it. */
function surface(t, clock) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db, clock ? { now: () => clock.now } : undefined);

  return { db, tools, call: handlers(tools) };
}

function refused(run, message) {
  let caught;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, message ?? 'the call was accepted when it should have been refused');
  return caught;
}

const STATE = JSON.stringify({ epic: '47-03', story: 6, step: 'hydration' });

// --- Resume under a new id ------------------------------------------------------------------------

test('a session survives resume under a new id, with one live end to the chain', (t) => {
  const clock = { now: '2026-08-09T09:00:00.000Z' };
  const { call } = surface(t, clock);

  const first = call.create_session({ id: 'sess-a', skill: 'cpm:do', phase: 'Story 6', state: STATE });

  assert.equal(first.superseded_by, null, 'a new session is the live end of its own chain');

  clock.now = '2026-08-09T10:00:00.000Z';
  const adopted = call.adopt_session({ id: 'sess-b', predecessor_id: 'sess-a', include_body: true });

  // The state reached the new id, which is the whole of what the old `--resume` adoption did.
  assert.equal(adopted.id, 'sess-b');
  assert.equal(adopted.state, STATE);
  assert.equal(adopted.skill, 'cpm:do', 'the resume forgot which skill it was running');
  assert.equal(adopted.phase, 'Story 6');
  assert.equal(adopted.superseded_by, null, 'the adopting session is the live end');

  // And the predecessor points forward rather than being deleted — the record of the resume is
  // the link, so a chain read from either end tells the same story.
  assert.equal(call.read_session({ id: 'sess-a' }).superseded_by, 'sess-b');

  // Exactly one live end, asserted over the whole table rather than over the two ids this test
  // happens to know: that is the property the two-files-and-no-way-to-tell failure violated.
  const live = call.list_session({}).items.filter((row) => row.superseded_by === null);

  assert.deepEqual(live.map((row) => row.id), ['sess-b']);
});

test('a chain of three resumes still has one live end and one state', (t) => {
  const clock = { now: '2026-08-09T09:00:00.000Z' };
  const { call } = surface(t, clock);

  call.create_session({ id: 'sess-1', skill: 'cpm:do', state: STATE });

  for (const [predecessor, next] of [['sess-1', 'sess-2'], ['sess-2', 'sess-3']]) {
    clock.now = `2026-08-09T1${next.at(-1)}:00:00.000Z`;
    call.adopt_session({ id: next, predecessor_id: predecessor });
  }

  const live = call.list_session({}).items.filter((row) => row.superseded_by === null);

  assert.deepEqual(live.map((row) => row.id), ['sess-3']);
  assert.equal(call.read_session({ id: 'sess-3', include_body: true }).state, STATE);

  // Written to under its current id, and the earlier rows are untouched history rather than
  // copies that quietly disagree.
  clock.now = '2026-08-09T13:00:00.000Z';
  call.update_session({ id: 'sess-3', phase: 'Story 7' });

  assert.equal(call.read_session({ id: 'sess-3' }).phase, 'Story 7');
  assert.equal(call.read_session({ id: 'sess-1' }).phase, null);
});

test('a predecessor is adopted once, and a session cannot adopt itself', (t) => {
  const { call } = surface(t);

  call.create_session({ id: 'sess-a', state: STATE });
  call.adopt_session({ id: 'sess-b', predecessor_id: 'sess-a' });

  // Two resumes of one session, or a stale id replayed. Re-pointing the link would orphan
  // whichever branch lost, with no error and nothing afterwards able to find out.
  const twice = refused(() => call.adopt_session({ id: 'sess-c', predecessor_id: 'sess-a' }));

  assert.match(twice.message, /already adopted by 'sess-b'/);
  assert.equal(twice.rpc.code, -32602);
  assert.equal(call.read_session({ id: 'sess-a' }).superseded_by, 'sess-b');

  const itself = refused(() => call.adopt_session({ id: 'sess-b', predecessor_id: 'sess-b' }));
  assert.match(itself.message, /cannot supersede itself/);

  // Two controls: adopting the live end works, and adopting something absent is a named refusal
  // rather than a foreign key.
  assert.equal(call.adopt_session({ id: 'sess-d', predecessor_id: 'sess-b' }).id, 'sess-d');
  assert.match(
    refused(() => call.adopt_session({ id: 'sess-e', predecessor_id: 'nope' })).message,
    /no session with id 'nope'/,
  );
});

test('the adopting session may already exist, and the state still reaches it', (t) => {
  const { call } = surface(t);

  // **The case that made the first version of this tool wrong.** The harness issues the session
  // id and may record the row before anything asks to resume, so adoption cannot depend on dpm
  // being the one that created it — a resume whose state arrived only when the row happened not
  // to exist yet would pass every test here and fail in the field.
  call.create_session({ id: 'sess-a', skill: 'cpm:do', phase: 'Story 6', state: STATE });
  call.create_session({ id: 'sess-b' });

  const adopted = call.adopt_session({ id: 'sess-b', predecessor_id: 'sess-a', include_body: true });

  assert.equal(adopted.state, STATE, 'the state stopped at the row the harness had already made');
  assert.equal(adopted.skill, 'cpm:do');
  assert.equal(call.read_session({ id: 'sess-a' }).superseded_by, 'sess-b');
});

test('an adoption that would overwrite state is refused before anything is written', (t) => {
  const { call } = surface(t);

  call.create_session({ id: 'sess-a', skill: 'cpm:do', state: STATE });
  call.create_session({ id: 'sess-b', state: JSON.stringify({ mine: true }) });

  // A session already carrying its own state is not resuming the predecessor, and "adopt" is not
  // an operation anyone would expect to lose work under.
  const error = refused(() => call.adopt_session({ id: 'sess-b', predecessor_id: 'sess-a' }));

  assert.match(error.message, /already carries state of its own/);

  // Nothing was written: the link is the half that would otherwise survive a partial adoption,
  // and a predecessor marked superseded by a session that never continued it is unrecoverable.
  assert.equal(call.read_session({ id: 'sess-a' }).superseded_by, null);
  assert.equal(call.read_session({ id: 'sess-b', include_body: true }).state,
    JSON.stringify({ mine: true }));
});

// --- Staleness is a WHERE clause ------------------------------------------------------------------

test('stale sessions are selected by age, and fresh ones are not', (t) => {
  const clock = { now: '2026-08-01T00:00:00.000Z' };
  const { call } = surface(t, clock);

  const days = ['2026-08-01', '2026-08-03', '2026-08-05', '2026-08-07', '2026-08-09'];

  days.forEach((day, index) => {
    clock.now = `${day}T00:00:00.000Z`;
    call.create_session({ id: `sess-${index}`, skill: 'cpm:do', state: STATE });
  });

  const stale = call.list_session({ updated_before: '2026-08-06T00:00:00.000Z' });

  assert.deepEqual(stale.items.map((row) => row.id), ['sess-0', 'sess-1', 'sess-2']);

  // The control in both directions: no cutoff returns everything, and a cutoff before the oldest
  // returns nothing. A filter that was ignored would pass the first assertion alone.
  assert.equal(call.list_session({}).returned, days.length);
  assert.equal(call.list_session({ updated_before: '2026-07-01T00:00:00.000Z' }).returned, 0);

  // Age is measured from the last write, not from creation, which is what makes a long-running
  // session not look abandoned: touching the oldest row moves it out of the stale set.
  clock.now = '2026-08-10T00:00:00.000Z';
  call.update_session({ id: 'sess-0', phase: 'still going' });

  assert.deepEqual(
    call.list_session({ updated_before: '2026-08-06T00:00:00.000Z' }).items.map((row) => row.id),
    ['sess-1', 'sess-2'],
  );
});

test('the staleness cutoff composes with the other filters and with the bound', (t) => {
  const clock = { now: '2026-08-01T00:00:00.000Z' };
  const { call } = surface(t, clock);

  ['cpm:do', 'cpm:spec'].forEach((skill, group) => {
    for (let index = 0; index < 3; index += 1) {
      clock.now = `2026-08-0${index + 1}T00:00:00.000Z`;
      call.create_session({ id: `${skill}-${index}`, skill, state: STATE });
    }
    assert.ok(group >= 0);
  });

  const cutoff = '2026-08-03T00:00:00.000Z';

  assert.deepEqual(
    call.list_session({ skill: 'cpm:do', updated_before: cutoff }).items.map((row) => row.id),
    ['cpm:do-0', 'cpm:do-1'],
  );

  // Both filters are doing work: dropping either one widens the result.
  assert.equal(call.list_session({ updated_before: cutoff }).returned, 4);
  assert.equal(call.list_session({ skill: 'cpm:do' }).returned, 3);

  // And the bound still applies to a filtered page, which is what makes a staleness sweep over a
  // long-lived project safe to run without knowing how many rows it will find.
  const bounded = call.list_session({ updated_before: cutoff, limit: 1 });

  assert.equal(bounded.returned, 1);
  assert.equal(bounded.more, true);
});

// --- What the row replaces -------------------------------------------------------------------------

test('the state blob is withheld until asked for, on the read and on the list', (t) => {
  const { call } = surface(t);

  call.create_session({ id: 'sess-a', skill: 'cpm:do', phase: 'Story 6', state: STATE });

  const summary = call.read_session({ id: 'sess-a' });

  // The progress file's own failure mode, and the reason FR11 and FR13 meet on this table: the
  // whole blob was read every time anything wanted to know which skill was running.
  assert.equal(Object.hasOwn(summary, 'state'), false);
  assert.equal(summary.skill, 'cpm:do');
  assert.equal(summary.phase, 'Story 6');

  assert.equal(call.read_session({ id: 'sess-a', include_body: true }).state, STATE);
  assert.equal(Object.hasOwn(call.list_session({}).items[0], 'state'), false);
  assert.equal(call.list_session({ include_body: true }).items[0].state, STATE);
});

test('the session id is the caller\'s and is never minted here', (t) => {
  const { call } = surface(t);

  // Every other create tool in the surface mints a ULID. This one must not: the id *is*
  // `CPM_SESSION_ID`, issued before dpm is reached, and a row the harness cannot find under the
  // id it already holds is a row nothing can adopt.
  const written = call.create_session({ id: 'dc1fd4e4-eaa0-4de7-8e7f-f835c76e1d06' });

  assert.equal(written.id, 'dc1fd4e4-eaa0-4de7-8e7f-f835c76e1d06');
  assert.match(refused(() => call.create_session({ skill: 'cpm:do' })).message, /'id' is required/);

  // The control that it is a primary key and not a suffix scheme: the same id twice is refused,
  // which is what the session-suffixed filenames could not do.
  assert.match(
    refused(() => call.create_session({ id: 'dc1fd4e4-eaa0-4de7-8e7f-f835c76e1d06' })).message,
    /UNIQUE constraint failed/,
  );
});
