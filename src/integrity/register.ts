/**
 * The cross-row invariant register, as executable checks (FR14).
 *
 * The register in the Data Model lists the rules the schema **cannot** express, because each
 * spans rows the way a foreign key cannot — reachability across a graph, the existence of a
 * row conditional on a column elsewhere, or agreement between two ends of a four-table join.
 * FR14's position is that an invariant which cannot be a constraint is not thereby excused
 * from being checked: without this file each entry is enforced by nothing, is invisible, and
 * survives only as long as whoever knew it is still reading the code.
 *
 * **Every entry names its rows.** A check reporting that something is wrong without saying
 * where is a check nobody can act on, and it is also one that cannot be told apart from a
 * check that is merely broken — which is why the story's must-NOT is "reports a violation it
 * cannot locate, *or* passes a database holding one". Both halves are failures of the same
 * kind.
 *
 * **The numbers are the contract.** `entry` is the register's own number, and the parity test
 * compares this set against it in both directions: an entry with no check and a check with no
 * entry both fail. So a check is added here by adding a register row first, and the number is
 * not a label — it is the join key between a table in a document and a function in this file.
 *
 * **An entry may be advisory, and one is.** Every other entry names a state that should not
 * exist, and `restore` leans on that: it refuses a dump whose replay the register reports on, so
 * "add an entry" has always silently meant "refuse a dump holding this". Entry #14 names a
 * decision instead — a binding somebody retired while it was still sound, carrying the reason
 * they retired it — and a decision must not make a project's own dump un-restorable. So
 * `advisory: true` says the entry is checked, reported and located exactly as the others are and
 * settles nothing about whether the database is broken. It is a property of the entry rather
 * than a condition in `restore`, because `restore` asking "is this entry 14?" would be the same
 * decision written a second time, in the module least likely to be read when a fifteenth arrives.
 *
 * Three entries deserve their reasoning stated where it is executed rather than only in the spec:
 *
 * - **#6 reads `dependency_kind_endpoint` and declares nothing itself.** The pairs each edge kind
 *   admits are rows, seeded from what the skills actually write — which is what this entry used to
 *   hardcode as `builds_on` spec→spec and `constrains` ADR→ADR, and what it was wrong about: three
 *   shipped skills write `builds_on` between other kinds, so the check reported the lineage it was
 *   protecting. **A kind with no rows is passed over rather than read as admitting nothing**, which
 *   is what keeps `blocks` legal: its ends may be stories, a story is not a document kind, and no
 *   pair over that table can say what it admits. An edge with a story at either end is passed over
 *   for the same reason and always has been — the check joins `document` at both ends.
 *
 *   The rule is enforced twice from this one source: `create_dependency` refuses a violating edge
 *   at the write, by the same before-and-after comparison it uses for entry #1's cycles. Two
 *   `WHERE` clauses would be two answers, and a disagreement between the rule and the check
 *   produces a database this tool calls broken and the link tool will not let anyone repair.
 *
 * - **#10 checks the guards, not the rows.** "No row is written referencing a retired
 *   vocabulary row" is not decidable from a row after the fact: a row written *before* the
 *   retirement is legal and looks identical, and no detail table carries a timestamp to tell
 *   them apart. What is decidable, and is the state the register actually describes, is
 *   whether the guard exists at all — an unguarded reference is the condition under which the
 *   invariant silently stops holding. So the check derives the references exactly as
 *   `retirement.js` does and reports the ones no trigger covers.
 *
 * - **#14 asks when the retirement happened, and answers from two columns that say now.** A
 *   binding retired *because* its criterion was superseded is the ordinary case and is not this
 *   entry's business, so `story_criterion.superseded_at IS NULL` excludes it — including the
 *   retirements migration 027's trigger writes, which is the volume this entry would otherwise
 *   drown in. What is left is a binding whose fragment still matches and whose criterion nobody
 *   withdrew, retired by a person for a reason of their own. That is worth a reader's eye and is
 *   not worth a refusal, which is what `advisory` is for.
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { vocabularyReferences, guardName } from '../schema/retirement.ts';
// The marker form is defined where it is resolved, and imported here rather than restated. Two
// copies would let this check and the renderer disagree about what a marker is — silently in the
// direction that matters, since a narrower pattern here reports clean on something the renderer
// then refuses to render.
import { REFERENCE } from '../projection/markers.ts';

/**
 * One numbered row of the register, as an executable check.
 *
 * `check` returns the offending rows — empty when the invariant holds — and the rows are given no
 * fixed shape, deliberately. "Which rows" differs per entry and forcing them into one shape would
 * lose the part a reader needs, which is the same argument the register makes about the rows
 * themselves.
 *
 * The type that says that is `Record<string, any>` rather than `object`: both refuse to name
 * columns, but `object` also refuses to let a caller *read* one, and `create_dependency` reuses
 * entries 1 and 6 by asking their rows for `id` and `edge_id`. `any` for the reason the
 * projection's `Row` is — the columns are each entry's own `SELECT`, not this file's.
 */
export type ViolationRow = Record<string, any>;

type RegisterEntry = {
  entry: number;
  invariant: string;
  advisory?: boolean;
  check: (db: DatabaseSync) => ViolationRow[];
};

/** How far a reachability walk goes before giving up. A backstop, not a limit anyone reaches. */
const MAX_DEPTH = 64;

/**
 * Both ends of a `dependency` as single node ids, since an end is a document *or* a story and
 * every id is a ULID — so one column can carry either without ambiguity.
 */
const EDGE_NODES = `
  SELECT dependency.id AS edge_id, dependency.kind,
         coalesce(source_document_id, source_story_id) AS source,
         coalesce(target_document_id, target_story_id) AS target
    FROM dependency
`;

/** The spec a document belongs to, found by walking `parent_id` to the root of its tree. */
const ROOT_OF = `
  WITH RECURSIVE ancestry(id, node, parent) AS (
    SELECT id, id, parent_id FROM document
     UNION ALL
    SELECT ancestry.id, document.id, document.parent_id
      FROM ancestry JOIN document ON document.id = ancestry.parent
  )
  SELECT id, node AS root FROM ancestry WHERE parent IS NULL
`;

/** The epic a story hangs off, and the spec above that — the join #3, #4 and #7 all need. */
const CRITERION_SPEC = `
  SELECT story_criterion.id AS criterion_id, story.id AS story_id,
         story.epic_id AS epic_id, root.root AS spec_id
    FROM story_criterion
    JOIN story ON story.id = story_criterion.story_id
    JOIN (${ROOT_OF}) AS root ON root.id = story.epic_id
`;

/** A reachability walk over a directed edge set, reporting nodes reachable from themselves. */
function cycles(db: DatabaseSync, edges: string, parameters: SQLInputValue[] = []) {
  return db.prepare(`
    WITH RECURSIVE edge(source, target) AS (${edges}),
    walk(root, node, depth) AS (
      SELECT source, target, 1 FROM edge
       UNION
      SELECT walk.root, edge.target, walk.depth + 1
        FROM walk JOIN edge ON edge.source = walk.node
       WHERE walk.depth < ${MAX_DEPTH}
    )
    SELECT DISTINCT root AS id FROM walk WHERE node = root ORDER BY root
  `).all(...parameters).map((row) => ({ ...row }));
}

/**
 * The register. One entry per numbered row in the Data Model's table, in its order.
 *
 * Each `check` returns the offending rows — empty when the invariant holds. The rows are
 * whatever names the violation usefully; there is no fixed shape, because "which rows" differs
 * per entry and forcing them into one would lose the part a reader needs.
 *
 * The annotation is what types every `check` below: each is contextually a `RegisterEntry['check']`
 * and needs no parameter of its own, which is the same reason the array carried a `@type` before.
 */
export const REGISTER: RegisterEntry[] = [
  {
    entry: 1,
    invariant: 'No cycle among gates_work edges',
    check: (db) => cycles(db, `
      SELECT edge.source, edge.target FROM (${EDGE_NODES}) AS edge
        JOIN dependency_kind ON dependency_kind.kind = edge.kind
       WHERE dependency_kind.gates_work = 1
    `),
  },
  {
    entry: 2,
    invariant: 'A superseded ADR has a supersedes edge out of it',
    check: (db) => db.prepare(`
      SELECT adr.document_id AS id, document.title
        FROM adr JOIN document ON document.id = adr.document_id
       WHERE adr.decision_status = 'superseded'
         AND NOT EXISTS (
               SELECT 1 FROM dependency
                WHERE dependency.kind = 'supersedes'
                  AND dependency.source_document_id = adr.document_id
             )
       ORDER BY adr.document_id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 3,
    invariant: "A coverage row's requirement and its story criterion belong to the same spec",
    check: (db) => db.prepare(`
      SELECT coverage.id, requirement.spec_id AS requirement_spec, criterion.spec_id AS criterion_spec
        FROM coverage
        JOIN requirement ON requirement.id = coverage.requirement_id
        JOIN (${CRITERION_SPEC}) AS criterion ON criterion.criterion_id = coverage.story_criterion_id
       WHERE requirement.spec_id <> criterion.spec_id
       ORDER BY coverage.id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 4,
    invariant: "A coverage_story row's story is in the same epic as the coverage row it extends",
    check: (db) => db.prepare(`
      SELECT coverage_story.coverage_id, coverage_story.story_id,
             extra.epic_id AS story_epic, criterion.epic_id AS coverage_epic
        FROM coverage_story
        JOIN coverage ON coverage.id = coverage_story.coverage_id
        JOIN story AS extra ON extra.id = coverage_story.story_id
        JOIN (${CRITERION_SPEC}) AS criterion ON criterion.criterion_id = coverage.story_criterion_id
       WHERE extra.epic_id <> criterion.epic_id
       ORDER BY coverage_story.coverage_id, coverage_story.story_id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 5,
    // **Stated as "at least", because the register's own wording is only true for an instant.**
    // The spec says `next_value` is *greater than* every number allocated, and it is — in the
    // window between the allocation returning N and the document that consumes it being written.
    // Once written, `next_value` and the highest number are equal, and they stay equal until the
    // next allocation opens the window again. Both readings are correct; they measure at
    // different moments. A register check runs at an arbitrary moment, so the only form it can
    // assert is the one true at every one of them.
    //
    // Nothing is lost by the weaker form. What entry 5 exists to catch is a document numbered
    // *above* the counter — a number that reached a row without going through `number_sequence`,
    // which is FR5's guarantee broken rather than merely unconsumed. That is still caught.
    //
    // It passed vacuously until Epic 47-03 Story 2. The check joins `number_sequence` to
    // `document`, and until create tools existed no test both allocated a number and wrote it
    // onto a row, so the join was empty and the `HAVING` never ran.
    invariant: 'number_sequence.next_value is at least the highest number allocated for that kind',
    check: (db) => db.prepare(`
      SELECT number_sequence.kind, number_sequence.parent_id, number_sequence.next_value,
             max(coalesce(document.number, document.sequence)) AS highest
        FROM number_sequence
        JOIN document ON document.kind = number_sequence.kind
         AND (number_sequence.parent_id IS NULL OR document.parent_id = number_sequence.parent_id)
       GROUP BY number_sequence.kind, number_sequence.parent_id, number_sequence.next_value
      HAVING number_sequence.next_value < max(coalesce(document.number, document.sequence))
       ORDER BY number_sequence.kind
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 6,
    invariant: "A dependency's ends are kinds that edge admits",
    // **Nothing to check on a database that predates the table**, which is a real caller rather
    // than a hypothetical: `create_dependency` reuses this check, and a corpus is written through
    // this release's tools into an older release's schema by more than one migration test. A
    // prepare against a missing table raises at prepare time, so the guard is here and not in SQL.
    // Reporting nothing is also the honest answer — a database with no endpoint rules has no edge
    // that violates one, which is the same reading that leaves a kind with no rows unconstrained.
    check: (db) => (!db
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get('dependency_kind_endpoint') ? [] : db.prepare(`
      SELECT edge.edge_id, edge.kind, source.kind AS source_kind, target.kind AS target_kind
        FROM (${EDGE_NODES}) AS edge
        JOIN document AS source ON source.id = edge.source
        JOIN document AS target ON target.id = edge.target
       WHERE EXISTS (SELECT 1 FROM dependency_kind_endpoint
                      WHERE dependency_kind_endpoint.kind = edge.kind)
         AND NOT EXISTS (SELECT 1 FROM dependency_kind_endpoint
                          WHERE dependency_kind_endpoint.kind = edge.kind
                            AND dependency_kind_endpoint.source_kind = source.kind
                            AND dependency_kind_endpoint.target_kind = target.kind)
       ORDER BY edge.edge_id
    `).all().map((row) => ({ ...row }))),
  },
  {
    entry: 7,
    invariant: "A review's scope_story_id names a story inside the epic it reviews",
    check: (db) => db.prepare(`
      SELECT review.document_id AS id, review.scope_story_id, story.epic_id, document.parent_id
        FROM review
        JOIN document ON document.id = review.document_id
        JOIN story ON story.id = review.scope_story_id
       WHERE review.scope_story_id IS NOT NULL
         AND document.parent_kind = 'epic'
         AND story.epic_id <> document.parent_id
       ORDER BY review.document_id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 8,
    invariant: 'An accepted ADR has exactly one chosen option',
    check: (db) => db.prepare(`
      SELECT adr.document_id AS id,
             (SELECT count(*) FROM adr_option
               WHERE adr_option.adr_id = adr.document_id AND adr_option.chosen = 1) AS chosen
        FROM adr
       WHERE adr.decision_status = 'accepted'
         AND (SELECT count(*) FROM adr_option
               WHERE adr_option.adr_id = adr.document_id AND adr_option.chosen = 1) <> 1
       ORDER BY adr.document_id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 9,
    invariant: "coverage.spec_fragment is a substring of its requirement's text, while it is live",
    // `retired_at IS NULL` is what makes this entry a work list rather than a census. A retirement
    // carries a reason, so a broken binding somebody retired is one somebody already decided
    // about; going on naming it puts a settled decision in front of the next reader every time
    // they check, and an entry nobody can ever clear is one nobody reads.
    check: (db) => db.prepare(`
      SELECT coverage.id, coverage.requirement_id, coverage.spec_fragment
        FROM coverage JOIN requirement ON requirement.id = coverage.requirement_id
       WHERE instr(requirement.text, coverage.spec_fragment) = 0
         AND coverage.retired_at IS NULL
       ORDER BY coverage.id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 10,
    invariant: 'Every reference into a retirable vocabulary is guarded against new rows',
    check: (db) => {
      const triggers = new Set(
        db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'").all().map((t) => t.name),
      );

      // The same pair `retirement.ts` iterates when it creates the guards, narrowed to the type it
      // narrowed them to. A bare `string[]` here would let this check ask about an event no guard
      // is ever named for, and report every reference as unguarded.
      return vocabularyReferences(db).flatMap((reference) =>
        (['insert', 'update'] as const)
          .filter((event) => !triggers.has(guardName(reference, event)))
          .map((event) => ({
            table: reference.table,
            columns: reference.from.join(', '),
            parent: reference.parent,
            missing: guardName(reference, event),
          })));
    },
  },
  {
    entry: 11,
    invariant: 'session.superseded_by forms no cycle',
    check: (db) => cycles(db, `
      SELECT id, superseded_by FROM session WHERE superseded_by IS NOT NULL
    `),
  },
  {
    entry: 12,
    invariant: "A document_milestone row's document and milestone belong to the same spec",
    check: (db) => db.prepare(`
      SELECT document_milestone.document_id, document_milestone.milestone_id,
             root.root AS document_spec, milestone.spec_id AS milestone_spec
        FROM document_milestone
        JOIN milestone ON milestone.id = document_milestone.milestone_id
        JOIN (${ROOT_OF}) AS root ON root.id = document_milestone.document_id
       WHERE root.root <> milestone.spec_id
       ORDER BY document_milestone.document_id, document_milestone.milestone_id
    `).all().map((row) => ({ ...row })),
  },
  {
    entry: 13,
    invariant: 'Every {{ref:<id>}} marker in every prose column resolves to a live document',
    check: (db) => danglingMarkers(db),
  },
  {
    entry: 14,
    invariant: 'A binding retired while it was still sound is a judgement somebody made, not a fault',
    advisory: true,
    check: (db) => db.prepare(`
      SELECT coverage.id, coverage.requirement_id, coverage.retired_reason
        FROM coverage
        JOIN requirement ON requirement.id = coverage.requirement_id
        JOIN story_criterion ON story_criterion.id = coverage.story_criterion_id
       WHERE coverage.retired_at IS NOT NULL
         AND instr(requirement.text, coverage.spec_fragment) > 0
         AND story_criterion.superseded_at IS NULL
       ORDER BY coverage.id
    `).all().map((row) => ({ ...row })),
  },
];

/**
 * Every marker in the database that names no `document` row.
 *
 * **Every TEXT column is scanned, and the list is derived rather than declared.** A marker's
 * whole difficulty is that it lives inside prose where no foreign key can reach it, so a check
 * driven by a list of "the prose columns" fails in exactly the way the entry exists to prevent:
 * a column added later holds markers nothing sweeps, and the sweep still reports clean. Reading
 * `PRAGMA table_info` costs a wider scan and cannot miss a column. A marker in a column nobody
 * would call prose is a violation too.
 */
function danglingMarkers(db: DatabaseSync) {
  const tables = (db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>)
    .map((table) => table.name);

  const documents = new Set((db.prepare('SELECT id FROM document').all() as Array<{ id: string }>)
    .map((row) => row.id));
  const dangling = [];

  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string; type: string; pk: number }>;
    const text = columns.filter((column) => column.type.toUpperCase() === 'TEXT');
    if (text.length === 0) continue;

    const key = columns.filter((column) => column.pk > 0).map((column) => column.name);
    const identify = key.length > 0 ? key : text.map((column) => column.name);

    for (const column of text) {
      const rows = db
        .prepare(`SELECT ${[...new Set([...identify, column.name])].join(', ')} FROM ${table}
                   WHERE ${column.name} LIKE '%{{ref:%'`)
        .all() as Array<Record<string, unknown>>;

      for (const row of rows) {
        for (const [, id] of String(row[column.name]).matchAll(REFERENCE)) {
          if (documents.has(id)) continue;

          dangling.push({
            table,
            column: column.name,
            row: Object.fromEntries(identify.map((name) => [name, row[name]])),
            reference: id,
          });
        }
      }
    }
  }

  return dangling;
}
