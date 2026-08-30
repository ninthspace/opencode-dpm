/**
 * Number allocation — one statement per level, and both of them upserts.
 *
 * **It has to be an upsert, not an update, and the reason is a silent failure rather than an
 * inconvenience.** A bare `UPDATE … RETURNING` against a kind that has never been allocated
 * matches no row: it returns nothing and reports success, and the caller writes a document
 * with no number. That is FR5's whole promise failing on the first allocation of every kind,
 * with no error anywhere — and for child-numbered kinds it is not a once-per-project edge
 * case, because it recurs on the first epic under every new spec. The upsert creates the row
 * it needs, which also disposes of the question of who seeds the table and when.
 *
 * `RETURNING next_value` reads the value *after* the increment, so it returns 1 on the first
 * call, then 2, 3, … — monotonic irrespective of deletion or archival, because the counter
 * never consults the documents. That is what makes register #5 hold by construction rather
 * than by a check: nothing here can hand back a number it has handed back before.
 *
 * Epic 47-03 wraps these in MCP tools. This module is the statement and its guard, no more.
 */

import type { DatabaseSync } from 'node:sqlite';

const ROOT = `
  INSERT INTO number_sequence (kind, parent_id, next_value) VALUES (?, NULL, 1)
    ON CONFLICT (kind) WHERE parent_id IS NULL
    DO UPDATE SET next_value = number_sequence.next_value + 1
    RETURNING next_value
`;

const CHILD = `
  INSERT INTO number_sequence (kind, parent_id, next_value) VALUES (?, ?, 1)
    ON CONFLICT (kind, parent_id) WHERE parent_id IS NOT NULL
    DO UPDATE SET next_value = number_sequence.next_value + 1
    RETURNING next_value
`;

/**
 * Allocate the next number for `kind`, within `parentId` when the kind is child-numbered.
 *
 * @param parentId NULL or omitted for a root-numbered kind.
 * @returns The allocated value — 1 on the first call for that kind and parent.
 */
export function allocateNumber(db: DatabaseSync, kind: string, parentId: string | null = null): number {
  const allocated = parentId === null
    ? db.prepare(ROOT).get(kind)
    : db.prepare(CHILD).get(kind, parentId);

  // NFR6. The failure this exists for is not a thrown error but a returned nothing: an
  // allocation that reports success without a number is the exact shape FR5 forbids, and it
  // is indistinguishable from a working one at the call site unless someone looks.
  if (!allocated || typeof allocated.next_value !== 'number') {
    throw new Error(
      `allocating a number for ${kind}${parentId === null ? '' : ` under ${parentId}`} `
      + 'returned no value — refusing to let a document be written without one',
    );
  }

  return allocated.next_value;
}
