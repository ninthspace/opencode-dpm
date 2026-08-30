/**
 * Epic 47-04 Story 5 — the projection, the guard and the merge, composed (FR6, FR7, FR8, NFR6).
 *
 * Every story before this one is checkable in isolation, and each of them was. What none of them
 * can see is the other: Story 2's registry test and Story 3's guard test both pass in a world where
 * the guard regenerates twelve of thirteen kinds and diffs clean, because neither observes the
 * other. Story 3's own criteria are about exit codes and diagnostics, so it also passes against a
 * stubbed renderer. The last criterion here is the one that earns the story, and it is written
 * against a database the renderer cannot render.
 *
 * **The guard runs from a real `git commit`, through the hook installed the documented way.** That
 * is not ceremony. Story 3 exercised `run()` and `bin/dpm-guard.ts` directly and passed every time
 * against a hook that had never once been reached by git — `dirname "$0"` on the installed symlink
 * is `.git/hooks`, so the hook looked for the executable at `.git/bin/dpm-guard.ts`. Nothing below
 * this line would have found that either, except the test that commits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { committer } from './support/commit.js';
import { fullCorpus } from './support/corpus.js';
import { gitRepository, surface, twoBranches } from './support/git.js';
import { dump } from '../src/dump/index.ts';
import { DUMP_PATH, guard } from '../src/guard/index.ts';
import { run as runGuard } from '../src/guard/main.ts';
import { run as runMerge } from '../src/merge/main.ts';
import { identifiers, ProjectionError } from '../src/projection/naming.ts';
import { project } from '../src/projection/index.ts';
import { openConnection } from '../src/db/connection.ts';
import { restore } from '../src/restore/index.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import { capture } from './support/streams.js';

const ROOT = join(import.meta.dirname, '..');

/** Both streams of one command, so the exit code and the text are asserted from the same call. */
function invoke(command, options) {
  const written = capture();
  const code = command({ ...options, streams: written.streams });

  return { code, out: written.out, err: written.err };
}

/**
 * A repository holding the whole corpus, committed, with the pre-commit hook installed.
 *
 * The hook goes in as a symlink because that is what `dpm/hooks/pre-commit` tells a user to do,
 * and the symlink is the reason the hook was broken: a test that copied the file in would resolve
 * `$0` to a real path and pass against an install nobody performs.
 */
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-integration-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

  git('init', '--quiet', '--initial-branch', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');

  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const call = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));
  const documents = fullCorpus(db, call);

  const regenerate = () => {
    project(db, { root });
    writeFileSync(join(root, DUMP_PATH), dump(db).sql, 'utf8');
  };

  regenerate();

  // The database is derived from the dump and is not committed; AD4 commits the text.
  writeFileSync(join(root, '.gitignore'), '.dpm/dpm.db*\n', 'utf8');

  const hook = join(root, '.git', 'hooks', 'pre-commit');

  // The mode is left as it arrives — a fixture that set it would be supplying the one thing a real
  // install has to have been shipped with. `plugin.test.js` holds it to `100755`, in the index.
  symlinkSync(join(ROOT, 'hooks', 'pre-commit'), hook);

  // Commit everything, and assert the guard ran on both paths — see `support/commit.js`. Row 2's
  // second half is an accepted commit, which without that is satisfied by an uninstalled hook.
  const commit = committer(root);

  const first = commit('The corpus');

  assert.ok(first.ok, `the initial commit was refused:\n${first.output}`);

  return { root, location, db, call, documents, git, commit, regenerate };
}

// --- Criterion 1: determinism across the whole template set -------------------------------------

test('a database of all fourteen kinds regenerates byte-identically twice [integration]', (t) => {
  const repo = repository(t);

  // **Fourteen, and the count is asserted rather than assumed.** Story 1's determinism test ran
  // against one kind, and a renderer is deterministic per template — a second template that
  // emitted a timestamp would pass there and fail here, which is the whole reason this row exists
  // separately from row 1.
  const kinds = repo.db.prepare('SELECT kind FROM document_kind ORDER BY kind').all()
    .map((row) => row.kind);
  const present = repo.db.prepare('SELECT DISTINCT kind FROM document ORDER BY kind').all()
    .map((row) => row.kind);

  assert.equal(kinds.length, 14);
  assert.deepEqual(present, kinds, 'the corpus does not hold one document of every kind');

  const first = project(repo.db, { write: false });
  const second = project(repo.db, { write: false });

  // Fourteen documents plus the artifact register — see the guard test below for why the register
  // is counted rather than exempted. Determinism is the claim being made here, and it covers the
  // register too: its rows are ordered `published_at DESC, id DESC`, which is total.
  assert.equal(first.written.length + first.inline.length, 15);
  assert.deepEqual(second, first);

  // And on disk, which is where the guard will compare them. An in-memory renderer that agreed
  // with itself and a writer that normalised line endings would part company here.
  const onDisk = () => Object.fromEntries(
    project(repo.db, { write: false }).written
      .map((file) => [file.path, readFileSync(join(repo.root, file.path), 'utf8')]),
  );

  const before = onDisk();

  repo.regenerate();

  assert.deepEqual(onDisk(), before);
});

// --- Criterion 2: the guard, from a real commit -------------------------------------------------

test('a commit carrying only a database write is refused until both artefacts regenerate [feature]', (t) => {
  const repo = repository(t);

  repo.call.create_spec({ slug: 'search', title: 'Search' });

  // **One artefact regenerated and not the other** — the shape FR7 names second, and the one that
  // reads as current in a prose diff while the committed database is behind it.
  writeFileSync(join(repo.root, DUMP_PATH), dump(repo.db).sql, 'utf8');

  const refused = repo.commit('Half a regeneration');

  assert.ok(!refused.ok, 'the hook let a stale projection through');
  assert.match(refused.output, /does not match the database/);
  assert.match(refused.output, /02-spec-search\.md/);
  assert.match(refused.output, /is not on disk, and the database produces it/);

  // Nothing was fixed on the way past: the hook reports and stops.
  assert.ok(!readdirSync(join(repo.root, 'docs', 'specifications')).includes('02-spec-search.md'));

  project(repo.db, { root: repo.root });

  const accepted = repo.commit('Both artefacts');

  assert.ok(accepted.ok, `the hook refused a current tree:\n${accepted.output}`);
  assert.equal(invoke(runGuard, { root: repo.root, location: repo.location }).code, 0);
});

test('the hook reaches the guard through the symlink the install instructions describe [feature]', (t) => {
  const repo = repository(t);

  // The install is `ln -s …/dpm/hooks/pre-commit .git/hooks/pre-commit`, so git invokes the hook by
  // the symlink and `$0` is the link, not the file. A hook that took `dirname "$0"` as its own
  // directory looked for the executable in `.git/bin/` and failed on every commit with a Node
  // module-resolution stack trace — and no test that ran the executable directly could see it.
  const hook = execFileSync('sh', [join(repo.root, '.git', 'hooks', 'pre-commit')], {
    cwd: repo.root,
    encoding: 'utf8',
  });

  assert.match(hook, /projected files and \.dpm\/dpm\.sql match the database/);
  assert.ok(!/Cannot find module/.test(hook));
});

// --- Criterion 3: a merge, end to end -----------------------------------------------------------

test('a merge that renumbers a spec leaves filenames and cross-references agreeing [feature]', (t) => {
  const repo = gitRepository(t);

  // The base holds a spec that both branches will point a reference at, so whichever new spec is
  // renumbered, a *different* document's prose names it and has to follow.
  const anchor = repo.write((db, call) => call.create_spec({
    slug: 'persistence', title: 'Artefact persistence',
  }));

  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'The anchor');

  const adds = (slug, title, label) => (db, call) => {
    const made = call.create_spec({ slug, title });

    call.create_requirement({
      spec_id: anchor.id,
      label,
      class: 'functional',
      moscow: 'must',
      position: label === 'FR1' ? 0 : 1,
      text: `The system shall defer to spec {{ref:${made.id}}}.`,
    });

    return made;
  };

  const made = twoBranches(repo, {
    ours: adds('search', 'Search', 'FR1'),
    theirs: adds('export', 'Export', 'FR2'),
  });

  assert.ok(made.conflicted);
  assert.equal(invoke(runMerge, { root: repo.root }).code, 0);

  const db = openConnection(':memory:');

  t.after(() => db.close());
  restore(db, readFileSync(join(repo.root, DUMP_PATH), 'utf8'));

  const names = identifiers(db);

  // **Every projected filename carries the identifier the renderer would resolve a marker to.**
  // That is the agreement the criterion is about: the rename and the reference are one derivation,
  // so a renumber that moved the file and not the references — or the reverse — fails here.
  for (const { id, kind, slug } of db.prepare('SELECT id, kind, slug FROM document').all()) {
    const path = project(db, { write: false }).written.find((file) => file.path.includes(`-${slug}.`));

    if (!path) continue;

    assert.ok(
      path.path.endsWith(`${names.get(id)}-${kind}-${slug}.md`),
      `${path.path} does not carry ${kind} ${names.get(id)}`,
    );
  }

  // The anchor's prose names both specs by their *current* numbers, one of which moved.
  const anchorText = readFileSync(
    join(repo.root, 'docs', 'specifications', `${names.get(anchor.id)}-spec-persistence.md`),
    'utf8',
  );

  for (const spec of [made.ours, made.theirs]) {
    assert.ok(
      anchorText.includes(`spec ${names.get(spec.id)}.`),
      `the anchor does not name ${spec.slug} as ${names.get(spec.id)}:\n${anchorText}`,
    );
  }

  assert.notEqual(names.get(made.ours.id), names.get(made.theirs.id));
  assert.ok(!anchorText.includes('{{ref:'));

  // And regenerating from the merged database changes no bytes — the merge left the tree in the
  // state the projection would produce, not one step away from it.
  const before = Object.fromEntries(
    project(db, { write: false }).written
      .map((file) => [file.path, readFileSync(join(repo.root, file.path), 'utf8')]),
  );

  project(db, { root: repo.root });

  for (const [path, text] of Object.entries(before)) {
    assert.equal(readFileSync(join(repo.root, path), 'utf8'), text, `${path} changed on regeneration`);
  }

  assert.deepEqual(guard(db, { root: repo.root }).diverged, []);
});

// --- Criterion 4 (must NOT): the guard passing on a renderer that skipped a kind -----------------

test('must NOT — the guard passes because the renderer silently skipped a kind [integration]', (t) => {
  const repo = repository(t);

  assert.equal(invoke(runGuard, { root: repo.root, location: repo.location }).code, 0);

  // **A fourteenth kind, seeded the way a migration would seed one.** This is the composition the
  // story exists for: the guard regenerates and diffs bytes, so a renderer that quietly skipped an
  // unknown kind would produce a tree with one file missing, and the guard — walking only what the
  // renderer produced — would find every file it looked at matching and report clean.
  repo.db.prepare(`INSERT INTO document_kind (kind, dir, numbering)
                   VALUES ('ledger', 'ledgers', 'root')`).run();
  repo.db.prepare(`INSERT INTO document
                     (id, kind, numbering, number, slug, title, created_at, updated_at)
                   VALUES ('01LEDGERAAAAAAAAAAAAAAAAAA', 'ledger', 'root', 1, 'costs', 'Costs',
                           '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();

  // The renderer refuses the whole projection rather than skipping the kind, and names it.
  assert.throws(
    () => project(repo.db, { write: false }),
    (error) => error instanceof ProjectionError && /ledger/.test(error.message),
  );

  // And the guard, which calls that renderer, refuses too. **Exit 2, and specifically not 0**: a
  // guard that treated an unrenderable kind as "nothing diverged" is the false pass this row
  // forbids, and it is one `catch` away in any implementation.
  const { code, err, out } = invoke(runGuard, { root: repo.root, location: repo.location });

  assert.equal(code, 2, out);
  assert.match(err, /ledger/);
  assert.ok(!/match the database/.test(out), 'the guard reported a clean tree it could not render');
  assert.equal(out, '', 'a failure reached stdout, where a hook logs nothing');

  // From a commit, too — the exit code is what git reads, and 2 refuses the commit exactly as 1
  // does. A tree that cannot be rendered must not be committable.
  const refused = repo.commit('A kind with no template');

  assert.ok(!refused.ok, 'a commit went through against a database the renderer cannot render');
});

test('the guard checks every file the projection produces, and says how many', (t) => {
  const repo = repository(t);
  const rendered = project(repo.db, { write: false });
  const checked = guard(repo.db, { root: repo.root });

  // The pairing that makes "clean" mean something: an empty `diverged` is a pass over *this many*
  // files, and a renderer that produced fewer would shrink both numbers together without the
  // count ever being wrong. Row 21 is why the count is asserted against the corpus rather than
  // against the renderer's own output alone.
  assert.deepEqual(checked.diverged, []);
  assert.equal(checked.checked.files, rendered.written.length);

  // Fourteen documents and the artifact register, which is the one projected file that is not a
  // document — `artifact` is a standalone table with no kind, so it cannot come out of the
  // per-document loop. It is counted here rather than exempted, because the guard covering every
  // file *except* the register would be the stale-projection false pass one file wide.
  assert.equal(checked.checked.files + rendered.inline.length, 15);
  assert.ok(rendered.written.some((file) => file.path === 'docs/artifacts/index.md'),
    'the register was not among the projected files, so the count moved for another reason');
});
