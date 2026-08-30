/**
 * One deliberate violation per register entry, built through the tool surface.
 *
 * Two stories need these and they need them for different reasons. Epic 47-01 Story 6 asserts
 * that the tool reports each entry against a *live* database; Epic 47-02 Story 2 asserts that a
 * dump carrying each one is refused on *restore*. Those are different claims — the second is
 * about a path where every foreign key is advisory — but the violating states are identical, and
 * writing them twice would create two descriptions of the same thirteen invariants that drift
 * the first time the register moves.
 *
 * **The injections live here; the per-entry assertions do not.** Each caller checks different
 * things about the same violation — the live suite that both ends of a cycle are named, the
 * restore suite that the failure names its entry and rolls back — and folding those into one
 * shared expectation would weaken both. What is shared is the fixture, which is the part that
 * would drift.
 *
 * Every injection uses `create()` and the planning fixtures rather than SQL, except where the
 * violation *is* a statement the tool surface would refuse to write — a rewound counter, a
 * dropped guard, a cycle closed by an update. Those are the states a restore actually produces,
 * which is why they are reachable here and not through a creator.
 */

import assert from 'node:assert/strict';
import { checkIntegrity } from '../../src/integrity/check.ts';
import { create } from '../fixtures/index.js';
import { childDocument, rootDocument } from '../fixtures/planning.js';
import { ulid } from '../../src/id/ulid.ts';

/** A spec with an epic and a story — the shape most of these invariants span. */
export function corpus(db) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'epic-1', title: 'Epic 1' });
  const story = create(db, 'story', { epic_id: epic.id, number: 1 });

  return { spec, epic, story };
}

/**
 * The thirteen, in register order.
 *
 * `inject` mutates a clean corpus into one holding exactly its entry's violation, and may return
 * a value the caller needs to assert against — entry 13's missing id, for instance, which is
 * generated rather than fixed.
 *
 * `advisory` marks the entries that are reported without settling soundness. A caller asserting a
 * refusal has to skip them — a restore of a dump holding one succeeds, which is the whole of what
 * the flag is for — so the property is carried here beside the injection rather than derived from
 * the entry number at each call site.
 *
 * @type {{entry: number, advisory?: boolean, summary: string, inject: (db: any, context: object) => any}[]}
 */
export const VIOLATIONS = [
  {
    entry: 1,
    summary: 'a cycle among gates_work edges',
    inject: (db, { spec }) => {
      const second = rootDocument(db, 'spec', { number: 48, slug: 'successor' });
      const a = childDocument(db, 'epic', spec, { sequence: 2, slug: 'a', title: 'A' });
      const b = childDocument(db, 'epic', second, { sequence: 1, slug: 'b', title: 'B' });

      create(db, 'dependency', { source_document_id: a.id, target_document_id: b.id });
      create(db, 'dependency', { source_document_id: b.id, target_document_id: a.id });
    },
  },
  {
    entry: 2,
    summary: 'a superseded ADR with no supersedes edge out of it',
    inject: (db, { spec }) => {
      const adr = childDocument(db, 'adr', spec, { sequence: 1, slug: 'adr-1', title: 'ADR 1' });
      create(db, 'adr', { document_id: adr.id, decision_status: 'superseded' });
    },
  },
  {
    entry: 3,
    summary: "coverage joining one spec's requirement to another spec's criterion",
    inject: (db, { spec, story }) => {
      const other = rootDocument(db, 'spec', { number: 48, slug: 'other' });
      const requirement = create(db, 'requirement', {
        spec_id: other.id,
        text: 'A fragment lives here.',
      });
      const criterion = create(db, 'story_criterion', { story_id: story.id });

      create(db, 'coverage', {
        requirement_id: requirement.id,
        story_criterion_id: criterion.id,
        spec_fragment: 'A fragment lives here.',
      });

      assert.notEqual(other.id, spec.id);
    },
  },
  {
    entry: 4,
    summary: 'a coverage_story naming a story from another epic',
    inject: (db, { spec, story }) => {
      const requirement = create(db, 'requirement', { spec_id: spec.id, text: 'Fragment.' });
      const criterion = create(db, 'story_criterion', { story_id: story.id });
      const coverage = create(db, 'coverage', {
        requirement_id: requirement.id,
        story_criterion_id: criterion.id,
        spec_fragment: 'Fragment.',
      });

      const elsewhere = childDocument(db, 'epic', spec, {
        sequence: 2,
        slug: 'epic-2',
        title: 'Epic 2',
      });
      const stray = create(db, 'story', { epic_id: elsewhere.id, number: 1 });

      create(db, 'coverage_story', { coverage_id: coverage.id, story_id: stray.id });
    },
  },
  {
    entry: 5,
    summary: 'a sequence that would reissue a number already allocated',
    inject: (db) => {
      // The counter is written directly rather than rewound, because the fixtures number their
      // documents explicitly and so leave no `number_sequence` row to rewind — which is the
      // state a restore produces too, and is the reason the register calls this one repairable.
      db.prepare("INSERT INTO number_sequence (kind, parent_id, next_value) VALUES ('spec', NULL, 1)").run();
    },
  },
  {
    entry: 6,
    summary: 'a builds_on edge between two epics',
    inject: (db, { spec }) => {
      const a = childDocument(db, 'epic', spec, { sequence: 2, slug: 'a', title: 'A' });
      const b = childDocument(db, 'epic', spec, { sequence: 3, slug: 'b', title: 'B' });

      create(db, 'dependency', {
        kind: 'builds_on',
        source_document_id: a.id,
        target_document_id: b.id,
      });
    },
  },
  {
    entry: 7,
    summary: 'a review scoped to a story in an epic it does not review',
    inject: (db, { spec, epic }) => {
      const elsewhere = childDocument(db, 'epic', spec, {
        sequence: 2,
        slug: 'epic-2',
        title: 'Epic 2',
      });
      const stray = create(db, 'story', { epic_id: elsewhere.id, number: 1 });

      // A review is root-numbered but parented, so it is a `rootDocument` with a parent rather
      // than a `childDocument` — the numbering CHECK refuses the other combination.
      const review = rootDocument(db, 'review', {
        number: 1,
        slug: 'review-1',
        parent_id: epic.id,
        parent_kind: 'epic',
      });
      create(db, 'review', { document_id: review.id, scope: 'story', scope_story_id: stray.id });
    },
  },
  {
    entry: 8,
    summary: 'an accepted ADR with no chosen option',
    inject: (db, { spec }) => {
      const document = childDocument(db, 'adr', spec, {
        sequence: 1,
        slug: 'adr-1',
        title: 'ADR 1',
      });
      create(db, 'adr', { document_id: document.id, decision_status: 'accepted' });
      create(db, 'adr_option', { adr_id: document.id, name: 'Rejected option', chosen: 0 });
    },
  },
  {
    entry: 9,
    summary: 'a spec_fragment that appears nowhere in its requirement',
    inject: (db, { spec, story }) => {
      const requirement = create(db, 'requirement', {
        spec_id: spec.id,
        text: 'The system shall persist.',
      });
      const criterion = create(db, 'story_criterion', { story_id: story.id });

      create(db, 'coverage', {
        requirement_id: requirement.id,
        story_criterion_id: criterion.id,
        spec_fragment: 'a sentence the requirement does not contain',
      });
    },
  },
  {
    entry: 10,
    summary: 'a vocabulary reference no guard covers',
    inject: (db) => {
      db.exec('DROP TRIGGER finding_category_id_category_domain_not_retired_on_insert');

      return 'finding_category_id_category_domain_not_retired_on_insert';
    },
  },
  {
    entry: 11,
    summary: 'a cycle in session.superseded_by',
    inject: (db) => {
      const first = create(db, 'session', {});
      const second = create(db, 'session', { superseded_by: first.id });

      db.prepare('UPDATE session SET superseded_by = ? WHERE id = ?').run(second.id, first.id);
    },
  },
  {
    entry: 12,
    summary: 'a document assigned to a milestone belonging to another spec',
    inject: (db, { epic }) => {
      const other = rootDocument(db, 'spec', { number: 48, slug: 'other' });
      const milestone = create(db, 'milestone', {
        spec_id: other.id,
        label: 'M1',
        title: 'Elsewhere',
      });

      create(db, 'document_milestone', { document_id: epic.id, milestone_id: milestone.id });
    },
  },
  {
    entry: 13,
    summary: 'a {{ref:}} marker naming a document that is not there',
    inject: (db, { epic }) => {
      const missing = ulid();

      create(db, 'document_section', {
        document_id: epic.id,
        heading: 'Context',
        position: 1,
        body: `As decided in {{ref:${missing}}}, the substrate lands first.`,
      });

      return missing;
    },
  },
  {
    entry: 14,
    advisory: true,
    summary: 'a binding retired while its fragment still matched and its criterion was still live',
    inject: (db, { spec, story }) => {
      const requirement = create(db, 'requirement', {
        spec_id: spec.id,
        text: 'The register names a retirement somebody made while the binding was sound.',
      });
      const criterion = create(db, 'story_criterion', { story_id: story.id });

      // Retired directly rather than through `retire_coverage`, for the reason the module opens
      // with: these fixtures run on the restore path too, where there is no tool surface at all.
      const row = create(db, 'coverage', {
        requirement_id: requirement.id,
        story_criterion_id: criterion.id,
        spec_fragment: 'a retirement somebody made while the binding was sound',
      });

      db.prepare('UPDATE coverage SET retired_at = ?, retired_reason = ? WHERE id = ?')
        .run('2026-08-27T00:00:00Z', 'The criterion was folded into another story.', row.id);
    },
  },
];

/**
 * The violation the tool reported for one register entry, or `undefined` when it found none.
 *
 * Two suites ask this — `integrity.test.js` per entry, `integrity-live-bindings.test.js` for the
 * ids entry 9 names — and the shape of a report is the module's business rather than either
 * caller's.
 *
 * @param {{violations: {entry: number}[]}} report
 * @param {number} entry
 */
export const forEntry = (report, entry) =>
  report.violations.find((violation) => violation.entry === entry);

/**
 * The ids one register entry names in a database, sorted — the whole list, never a membership.
 *
 * Both coverage-entry suites assert this way, and deliberately: "the entry is quiet" is equally
 * true of an entry that stopped looking, so a claim about an entry is a claim about the set it
 * returns. Sorted because entry order is `coverage.id` and a caller building an expectation from
 * two creates should not have to know that.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} entry
 */
export function namedBy(db, entry) {
  const found = forEntry(checkIntegrity(db), entry);

  return (found?.rows ?? []).map((row) => row.id).sort();
}

/** One entry's violation, by number. Throws rather than returning undefined for an unknown one. */
export function violation(entry) {
  const found = VIOLATIONS.find((candidate) => candidate.entry === entry);
  if (!found) throw new Error(`no violation fixture for register entry ${entry}`);

  return found;
}
