/**
 * FR7 — what accounts for a story criterion, when it is not a requirement.
 *
 * A criterion is normally accounted for by a coverage row quoting the requirement it delivers. A
 * criterion written because an **accepted decision** constrains the story has nothing to quote: an
 * ADR is not a requirement, there is no fragment to bind, and until `warrant_adr_id` existed such a
 * criterion was indistinguishable in a roll-up from one nobody got round to binding. One is
 * finished work and the other is a gap, and reporting them the same way is how a project comes to
 * ignore its own gap list.
 *
 * **So the rule is a query, not a paragraph in two skills.** `dpm-do`'s roll-up and `dpm-epics`'
 * gap check both need this judgement, and it has three inputs rather than one: a live binding, a
 * warrant, and — since a superseded criterion's bindings retire — the fact that a binding can stop
 * counting without going anywhere. Written out in English twice it would drift, and nothing would
 * notice. Written here it is one answer both skills read, and it is the same answer next release.
 *
 * **`retired_at IS NULL` is the whole of the interaction with retirement.** A criterion that had a
 * binding and lost it to a withdrawal reads as unaccounted-for unless something else accounts for
 * it, which is precisely what a roll-up should say. A count over every row ever bound would report
 * the criterion as covered by a binding nobody stands behind.
 */

import type { DatabaseSync } from 'node:sqlite';

import { overRows } from '../tools/convention.ts';

/** The field this puts on a story criterion. Named once, because two skills read it. */
export const ACCOUNTED_FIELD = 'accounted_for';

/**
 * Which of these criteria carry at least one live binding.
 *
 * **One query for the page, not one per row.** A fifty-row list is one statement here, for the
 * reason `withReference` gives about `identifiers`: a per-row lookup satisfies every criterion
 * about the answer and fails the one about the cost, and it is invisible in a test that lists two
 * rows.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string[]} ids
 * @returns {Set<string>}
 */
function boundCriteria(db: DatabaseSync, ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();

  const rows = db
    .prepare(`SELECT DISTINCT story_criterion_id FROM coverage
               WHERE retired_at IS NULL
                 AND story_criterion_id IN (${ids.map(() => '?').join(', ')})`)
    .all(...ids) as Array<{ story_criterion_id: string }>;

  return new Set(rows.map((row) => row.story_criterion_id));
}

/**
 * Put `accounted_for` on one story criterion row or a page of them.
 *
 * A criterion is accounted for when it has a live coverage row **or** carries a warrant. The `or`
 * is the requirement: a warrant does not displace a binding where requirement text exists to quote,
 * and a criterion carrying both goes on counting its binding.
 *
 * The value is `true`/`false` rather than 0/1 — nothing stores it, so there is no column whose
 * spelling it has to match, and a boolean is what a reader asking "is this accounted for?" means.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {unknown} value One row, or a page of them.
 * @returns {unknown}
 */
export function withAccountedFor(db: DatabaseSync, value: unknown) {
  if (value === null || typeof value !== 'object') return value;

  const shaped = value as { items?: unknown };
  const rows = (Array.isArray(shaped.items) ? shaped.items : [value]) as Array<{ id?: string }>;
  const bound = boundCriteria(
    db,
    rows.map((row) => row.id).filter((id): id is string => id !== undefined),
  );

  return overRows(value, (row: { id: string; warrant_adr_id: string | null }) => ({
    ...row,
    [ACCOUNTED_FIELD]: bound.has(row.id) || row.warrant_adr_id !== null,
  }));
}
