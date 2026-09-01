/**
 * Epic 47-10 Story 6 — the guard names a fix that exists (FR7, NFR6).
 *
 * The guard has always ended by telling the reader to regenerate both artefacts, and until this
 * epic nothing could. The sentence was true and useless: it named an operation rather than a
 * command, and the operation had no implementation behind it.
 *
 * **The interesting criterion is the second must-NOT**, and it is about how the first is asserted.
 * A message naming `bin/dpm-publish.ts` is correct the day it is written and silently wrong the day
 * the file moves — help that sends the reader nowhere, which is exactly NFR6's class of failure: it
 * looks like success. So the path is derived rather than spelled, and what is asserted is that it
 * exists on disk, which is a claim a rename can fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { committer } from './support/commit.js';
import { publishedRepository } from './support/published.js';
import { publish } from '../src/publish/index.ts';
import {
  describe, guard, DIVERGENCE, DUMP_PATH, PUBLISH_COMMAND, PUBLISH_INVOCATION, PUBLISH_SKILL,
} from '../src/guard/index.ts';
import { SKILL_FILE, discoverSkills } from '../src/plugin/skills.ts';

const ROOT = join(import.meta.dirname, '..');

/** A published repository, with the hook installed as a symlink and the corpus committed. */
function repository(t) {
  // Published through the release's own path — `start`, the tool surface, `publish` — so what this
  // file departs from is a state dpm produces rather than one the fixture assembled.
  const { root, git, db, call, documents, location } = publishedRepository(t, 'dpm-guard-fix-');

  writeFileSync(join(root, '.gitignore'), '.dpm/dpm.db*\n', 'utf8');

  // A symlink, because that is what the hook's own install instructions say — and the symlink is
  // what broke it once before: a test that copied the file in resolves `$0` to a real path and
  // passes against an install nobody performs.
  //
  // The mode is left as it arrives. Setting it here would hand the fixture a hook a real install
  // has to have been shipped; `plugin.test.js` is where it is held to `100755`, in the index.
  symlinkSync(join(ROOT, 'hooks', 'pre-commit'), join(root, '.git', 'hooks', 'pre-commit'));

  // Asserts the guard ran, on both paths — see `support/commit.js`. Criterion 3's control commit
  // is the one that needs it: "a tree in agreement was accepted" is satisfied by no hook at all.
  const commit = committer(root);

  const first = commit('The corpus');

  assert.ok(first.ok, `the initial commit was refused:\n${first.output}`);

  return { root, location, db, call, documents, git, commit };
}

// --- Criterion 1: the message names the command ---------------------------------------------

test('the divergence message names the command that resolves it', (t) => {
  const repo = repository(t);

  repo.call.create_spec({ slug: 'later', title: 'A spec added after publishing' });

  const message = describe(guard(repo.db, { root: repo.root }));

  // **The wrong answer is the sentence this replaces**: "Regenerate both artefacts to resolve" is
  // true, names no command, and left every reader of it with a refused commit and nowhere to go.
  // `do` or `does` — the message pluralises on the count, and pinning one of them makes this a
  // test of how many files the fixture happens to move.
  assert.match(message, /do(es)? not match the database/, 'the message stopped reporting divergence');
  assert.ok(message.includes(PUBLISH_COMMAND),
    `the message does not name the command:\n${message}`);
  // **The phrase rather than the id**, because `dpm-publish` is a substring of `bin/dpm-publish.ts`
  // and matching the id would be satisfied by the line above naming the binary.
  assert.ok(message.includes(PUBLISH_INVOCATION),
    'the message names the binary and not the skill, so a run already in a session is sent out of it');

  // **And it names the v2 invocation rather than the one Claude Code minted.** `/dpm:publish` was a
  // slash command per skill; v2 has no such trigger, so a reader who followed it literally would be
  // told to type something the host does not answer to — at the moment their commit was refused.
  assert.doesNotMatch(message, /\/dpm:/, `the guard still names a slash command:\n${message}`);

  // And it is still a diagnostic rather than an instruction to run something blindly: the reason
  // the edit was left in place has to survive the addition.
  assert.match(message, /is not an input/);
  assert.match(message, /Nothing was written/);
});

test('must NOT — the message names a command and nothing asserts the command exists', () => {
  // **This is the criterion, and it is a claim about the test rather than about the message.** A
  // string assertion passes forever: rename the binary and `describe` goes on naming the old path,
  // the guard goes on being helpful-looking, and the reader goes on finding nothing there. What
  // makes it checkable is asking the filesystem.
  assert.equal(existsSync(PUBLISH_COMMAND), true,
    `the guard names ${PUBLISH_COMMAND} and there is nothing there`);

  // Derived from the module's own location rather than spelled, so a move takes the message with
  // it. Asserted by shape, because the absolute prefix differs per machine.
  assert.match(PUBLISH_COMMAND, /[/\\]bin[/\\]dpm-publish\.ts$/);

  // **The same reading for the other half of the sentence.** A skill renamed or removed fails here,
  // in the suite, rather than in the terminal of someone whose commit has just been refused.
  //
  // **This used to run a composition backwards, and epic 02-02 removed the composition.** The id
  // was built at registration out of a directory that did not carry the prefix, so the only way to
  // ask the filesystem about it was to strip the prefix off again — `PUBLISH_SKILL.slice(…)` — and
  // then a separate assertion that the prefix was there to strip. The prefix lives on disk now, so
  // both collapse into the one question worth asking: **is this a name the plugin actually
  // registers?** Asked of the discoverer rather than of the filesystem, because a directory the
  // discoverer skips — one with no `SKILL.md` — is not a skill however much it looks like one.
  assert.ok(discoverSkills(ROOT).some((skill) => skill.name === PUBLISH_SKILL),
    `the guard offers the skill ${PUBLISH_SKILL} and the plugin registers no such name`);
  assert.equal(existsSync(join(ROOT, 'skills', PUBLISH_SKILL, SKILL_FILE)),
    true, `the guard names the skill ${PUBLISH_SKILL} and there is no such skill`);

  // The control: the same reading over a path that does not exist is false, so the assertions above
  // are facts about the filesystem and not about `existsSync` always agreeing.
  assert.equal(existsSync(join(ROOT, 'bin', 'dpm-publish-that-is-not-there.js')), false);
  assert.equal(existsSync(join(ROOT, 'skills', 'publish-that-is-not-there', SKILL_FILE)), false);
});

// --- Criterion 2: publishing resolves it, and not publishing leaves both artefacts named --------

test('a write leaves both artefacts named, and publishing clears them', (t) => {
  const repo = repository(t);

  repo.call.create_spec({ slug: 'later', title: 'A spec added after publishing' });

  const diverged = guard(repo.db, { root: repo.root });
  const paths = diverged.diverged.map((file) => file.path);

  // **Both, and that is the half a per-artefact check misses.** A write moves the dump and the
  // projection together; a guard that reported only the markdown would let a commit through
  // carrying a readable diff over a database nobody reviewed, which is FR7's second failure.
  assert.ok(paths.includes(DUMP_PATH), 'the dump was not named');
  assert.ok(paths.some((path) => path.startsWith('docs/')), 'the projection was not named');
  assert.ok(diverged.diverged.some((file) => file.reason === DIVERGENCE.missing));

  publish(repo.db, { root: repo.root });

  const after = guard(repo.db, { root: repo.root });

  assert.deepEqual(after.diverged, [], `publishing did not resolve what the guard named:\n${
    describe(after)}`);

  // The control that keeps the pair honest: the guard is capable of failing on this tree, so the
  // clean result above is the publish having worked rather than a guard that reports nothing.
  writeFileSync(join(repo.root, DUMP_PATH), 'not the dump\n', 'utf8');
  assert.equal(guard(repo.db, { root: repo.root }).diverged.length, 1);
});

// --- Criterion 3 (must NOT): the hook refuses and repairs nothing --------------------------------

test('must NOT — the hook regenerates and stages, overwriting a hand-edit', (t) => {
  const repo = repository(t);

  const spec = repo.documents.spec;
  const edited = repo.db.prepare('SELECT slug, number FROM document WHERE id = ?').get(spec.id);
  // Padded to two digits, the same as the renderer does. Spelled here rather than imported from
  // `naming.js`, because this test is about the hook and a path derived from the code under test
  // would agree with a renderer that had stopped naming files the way it says it does.
  const number = String(edited.number).padStart(2, '0');
  const path = join(repo.root, 'docs', 'specifications', `${number}-spec-${edited.slug}.md`);

  assert.ok(existsSync(path), `the fixture's spec is not at ${path}`);

  // A hand-edit of a generated file — the thing FR7 exists to notice, and the thing a hook that
  // "helpfully" regenerated would destroy without telling anyone.
  const mine = `${readFileSync(path, 'utf8')}\nA paragraph I wrote by hand.\n`;

  writeFileSync(path, mine, 'utf8');

  const refused = repo.commit('My edit');

  // **Asserted against the hook's behaviour on a dirty tree, not against the absence of a write in
  // its source.** A source sweep passes on a hook that shells out to something that writes.
  assert.equal(refused.ok, false, 'the commit was allowed through with a hand-edited file');
  assert.match(refused.output, /do(es)? not match the database/);
  assert.ok(refused.output.includes(PUBLISH_COMMAND),
    `the refusal did not name the fix:\n${refused.output}`);

  // The edit is still there, byte for byte. This is the whole must-NOT: a hook that regenerated
  // would leave the file correct-looking, the commit passing, and the paragraph gone.
  assert.equal(readFileSync(path, 'utf8'), mine, 'the hook overwrote the edit it was refusing');

  // And nothing was staged behind it — a hook that regenerated and staged would leave the index
  // holding a file the author never wrote.
  assert.match(repo.git('status', '--porcelain'), /docs\/specifications\//,
    'the edit vanished from the working tree');

  // The control: with the generated file restored, a commit goes through. Without it this test
  // passes against a hook that refuses everything.
  //
  // Something the guard has no opinion about is committed alongside, because a tree with nothing
  // staged fails at git rather than at the hook — which would read here as the hook allowing it.
  writeFileSync(path, mine.replace('\nA paragraph I wrote by hand.\n', ''), 'utf8');
  writeFileSync(join(repo.root, 'NOTES.md'), 'A file dpm does not generate.\n', 'utf8');

  const allowed = repo.commit('A file of my own, outside the projection');

  assert.equal(allowed.ok, true, `a tree in agreement was refused:\n${allowed.output}`);
});
