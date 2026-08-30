/**
 * What adopting dpm costs a repository that used CPM, and whether the command the README tells a
 * reader to run still covers it.
 *
 * - "The `git mv` in `README.md` leaves a CPM corpus with nothing the projection would reclaim"
 *   [unit]
 * - "It sends the corpus somewhere the walk cannot reach" [unit]
 * - "A directory with no kind mapped to it is never walked, and a name carrying no kind token is
 *   never a candidate" [unit]
 * - "must NOT — the run passes on a corpus with nothing at risk, so a fixture that parses to
 *   nothing reads as a command that covers everything" [unit]
 *
 * **This was two documents and is now one** (epic 01-04 story 4). `MIGRATION.md` carried the same
 * `git mv`, and the audit held the pair to agreeing with each other as well as to the walk. The
 * file does not port: the CPM migration happens while CPM is installed, under Claude Code, so the
 * guide is maintained with that release and this package does not carry a copy. The agreement
 * check went with it — a second document is what made agreement a question — but `audit` still
 * takes the documents as a map and reports each by name, because the shape it is checking is "the
 * instructions a reader is given", and that is a set whether it currently holds one or two.
 *
 * **The move is executed, not read.** `orphans()` matches a *kind token* — `-spec-`, `-epic-` —
 * against dpm's own kind names, and CPM's word for a document is dpm's kind name for some of the
 * twelve projected directories and something else for the rest. Which is which is a coincidence of
 * vocabulary that a renamed kind silently changes, so the README tells the reader to move all
 * twelve and does not enumerate the ones at risk. The check that matches that instruction is to
 * run the command on a corpus and see what is left, rather than to reconcile a list against a set.
 *
 * **What this does not check.** Only the `git mv` block is parsed; the prose around it is not. And
 * the corpus is one file per shape CPM writes, so a shape nobody thought of is not covered by the
 * fact that this passes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openPlanningDatabase } from './support/planning-database.js';
import { orphans } from '../src/guard/index.ts';

const ROOT = join(import.meta.dirname, '..');

/**
 * One file of every shape CPM writes, named exactly as CPM names them.
 *
 * The last two are neither CPM's nor dpm's, and are here because they are the claims most easily
 * broken by a widening of the rule: a hand-kept README inside a walked directory, and a corpus
 * already parked one level down.
 */
const CPM_TREE = [
  'docs/plans/01-plan-auth.md',
  'docs/briefs/01-brief-auth.md',
  'docs/architecture/02-adr-event-sourcing.md',
  'docs/specifications/47-spec-auth.md',
  'docs/epics/47-01-epic-auth.md',
  'docs/epics/47-01-coverage-auth.md',
  'docs/retros/41-retro-auth.md',
  'docs/quick/30-quick-auth-spec.md',
  'docs/discussions/18-discussion-auth.md',
  'docs/reviews/01-review-auth.md',
  'docs/communications/01-summary-memo-auth.md',
  'docs/library/lessons-learned.md',
  'docs/epics/README.md',
  'docs/archive/specifications/40-spec-old.md',
];

/** The tree on a disk, because `orphans()` walks one and the move renames directories in one. */
function cpmTree(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-cpm-corpus-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of CPM_TREE) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), '# a document CPM wrote\n', 'utf8');
  }

  return root;
}

/** `docs/retros` and `docs/cpm/` both name a directory; the sets below hold the bare name. */
const named = (token) => token.replace(/^docs\//, '').replace(/\/$/, '');

/**
 * The `git mv` a document tells a reader to run — what it moves, and where it sends it.
 *
 * Line continuations are folded and a trailing comment dropped, so the destination is the last
 * word of the command rather than the last word of whichever line it happens to sit on.
 */
function move(source) {
  const found = source.match(/git mv ((?:[^\n]*\\\n)*[^\n]*)/);

  if (!found) return null;

  const words = found[1].replace(/\\\n/g, ' ').replace(/#.*$/, '').trim().split(/\s+/);

  return { moves: words.slice(0, -1), destination: words.at(-1) };
}

/**
 * Run the plan, the way `git mv` would: each source that exists is renamed under the destination.
 *
 * A source the repository does not have is skipped rather than failing, because that is what both
 * documents tell the reader to do with the folders they never used.
 */
function apply(root, plan) {
  mkdirSync(join(root, plan.destination), { recursive: true });

  for (const source of plan.moves) {
    if (existsSync(join(root, source))) {
      renameSync(join(root, source), join(root, plan.destination, named(source)));
    }
  }
}

/**
 * Every document that gives the instruction, held to the outcome it promises rather than to a list
 * it recites.
 *
 * A complaint list rather than a run of assertions, so the controls below can drive it on inputs
 * they invent instead of restating its rules in a second place.
 *
 * @param {{projected: Set<string>, documents: Record<string, string>, atRisk: string[],
 *          survives: (plan: {moves: string[], destination: string}) => string[]}} inputs
 * @returns {string[]}
 */
function audit({ projected, documents, atRisk, survives }) {
  const complaints = [];

  // The floor. `survives` returning nothing is the pass condition below, so a corpus that was
  // never at risk — or a reclaim that stopped working — reads exactly like a command that covers
  // everything. And a document set that is empty would pass every check under it.
  if (!atRisk.length) complaints.push('nothing in the corpus was at risk, so the move proved nothing');
  if (!projected.size) complaints.push('no projected directories, so no coverage was checked');
  if (!Object.keys(documents).length) complaints.push('no documents were audited');

  const plans = Object.fromEntries(Object.entries(documents)
    .map(([which, source]) => [which, move(source)]));

  for (const [which, plan] of Object.entries(plans)) {
    if (!plan) {
      complaints.push(`${which} gives no git mv, so a reader is told to move a corpus by hand`);
      continue;
    }

    if (projected.has(named(plan.destination))) {
      complaints.push(`${which} sends the corpus to docs/${named(plan.destination)}/, which is walked`);
    }

    const moved = new Set(plan.moves.map(named));

    for (const dir of projected) {
      if (!moved.has(dir)) complaints.push(`${which}'s git mv leaves docs/${dir}/ behind, and it is walked`);
    }

    for (const path of survives(plan)) {
      complaints.push(`${which}'s git mv leaves ${path} for the first publish to reclaim`);
    }
  }

  // **Kept for a set of one, and it costs nothing.** Two documents is what made agreement a
  // question, and there is one now; written over the map rather than over two named fields, the
  // check is simply satisfied while the set is a singleton and starts constraining again the day
  // a second document gives the same instruction. The controls below drive it on an invented pair,
  // so it is exercised rather than merely present.
  const destinations = [...new Set(Object.values(plans)
    .filter((plan) => plan !== null).map((plan) => plan.destination))];

  if (destinations.length > 1) {
    complaints.push(`the documents disagree on where the corpus goes: ${destinations.join(' and ')}`);
  }

  return complaints;
}

/** The live inputs: the documents as shipped, and a reclaim driven on a real tree. */
function inputs(t) {
  const db = openPlanningDatabase(t);
  const reclaimed = (root) => orphans(db, root, new Set()).map(({ path }) => path);

  return {
    projected: new Set(db.prepare('SELECT DISTINCT dir FROM document_kind WHERE dir IS NOT NULL')
      .all().map(({ dir }) => dir)),
    documents: { README: readFileSync(join(ROOT, 'README.md'), 'utf8') },
    atRisk: reclaimed(cpmTree(t)),

    // A fresh tree per plan, because applying one renames the directories the next would move.
    survives: (plan) => {
      const root = cpmTree(t);

      apply(root, plan);

      return reclaimed(root);
    },
  };
}

test('the move each document prescribes leaves a CPM corpus with nothing to reclaim [unit]', (t) => {
  assert.deepEqual(audit(inputs(t)), []);
});

test('the directories the walk never reaches, and the names it cannot mistake [unit]', (t) => {
  const { atRisk } = inputs(t);

  // No kind is mapped to `architecture` — dpm renders an ADR inside the document that raised it —
  // so nothing under it is a candidate. That is what lets both guides say to leave ADRs alone.
  assert.equal(atRisk.includes('docs/architecture/02-adr-event-sourcing.md'), false, 'an ADR was taken');

  // One level deep, which is the whole safety of parking the corpus in a subdirectory.
  assert.equal(atRisk.includes('docs/archive/specifications/40-spec-old.md'), false,
    'the walk descended past the projection directory');

  // A name carrying no kind token, inside a directory that is walked.
  assert.equal(atRisk.includes('docs/epics/README.md'), false, 'a hand-kept README was taken');
});

/**
 * A pair of documents that agree, invented for the controls below, with a `survives` that reports
 * what a plan missed without running anything.
 *
 * **Synthetic rather than the live files with an edit applied.** A control built by copying the
 * shipped documents asserts they are accurate a second time, so a real drift fails it too and the
 * message it prints stops being about the mechanism it was written for. The same goes for the
 * reclaim: a stub here means a regression in `orphans()` fails the live test above and only that.
 *
 * The two `git mv` lines differ on purpose — one carries a trailing comment, the other a
 * continuation.
 */
const INVENTED = {
  projected: new Set(['alpha', 'beta', 'gamma']),
  atRisk: ['docs/alpha/01-thing.md'],
  documents: {
    README: '```sh\ngit mv docs/alpha docs/beta docs/gamma docs/parked/   # drop any you lack\n```\n',
    MIGRATION: '```sh\ngit mv docs/alpha docs/beta \\\n       docs/gamma docs/parked/\n```\n',
  },
  survives: (plan) => (plan.moves.map(named).includes('alpha') ? [] : ['docs/alpha/01-thing.md']),
};

/** `INVENTED` with one document rewritten, since the map has to be replaced rather than merged. */
const rewriting = (which, edit) => ({
  ...INVENTED,
  documents: { ...INVENTED.documents, [which]: edit(INVENTED.documents[which]) },
});

test('a command that no longer covers the corpus is named, and so is a bad destination [unit]', () => {
  assert.deepEqual(audit(INVENTED), [], 'the invented pair does not agree with itself');

  assert.deepEqual(
    audit(rewriting('MIGRATION', (text) => text.replace(' docs/beta', ''))),
    ["MIGRATION's git mv leaves docs/beta/ behind, and it is walked"],
  );

  // Dropping the one directory the corpus has files in fails twice: the coverage check names it,
  // and the executed move leaves something behind. Both, because a plan can cover every directory
  // and still be run against a tree that has more in it.
  assert.deepEqual(
    audit(rewriting('README', (text) => text.replace('docs/alpha ', ''))),
    [
      "README's git mv leaves docs/alpha/ behind, and it is walked",
      "README's git mv leaves docs/alpha/01-thing.md for the first publish to reclaim",
    ],
  );

  // The destination is checked against the walk rather than against a literal, so a guide that
  // renames the parking spot stays correct and one that picks a walked directory does not.
  assert.deepEqual(
    audit(rewriting('MIGRATION', (text) => text.replace('docs/parked/', 'docs/gamma/'))),
    [
      'MIGRATION sends the corpus to docs/gamma/, which is walked',
      'the documents disagree on where the corpus goes: docs/parked/ and docs/gamma/',
    ],
  );

  assert.deepEqual(audit(rewriting('README', () => 'no command here')), [
    'README gives no git mv, so a reader is told to move a corpus by hand',
  ]);

  // And the floor the live call now leans on: one document is a set, no documents is not.
  assert.deepEqual(audit({ ...INVENTED, documents: {} }), ['no documents were audited']);
});

test('must NOT — a corpus with nothing at risk reads as a command that covers everything [unit]', () => {
  assert.ok(audit({ ...INVENTED, atRisk: [] })
    .includes('nothing in the corpus was at risk, so the move proved nothing'));

  assert.ok(audit({ ...INVENTED, projected: new Set() })
    .includes('no projected directories, so no coverage was checked'));
});
