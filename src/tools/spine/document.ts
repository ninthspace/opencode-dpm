/**
 * Every document kind — one table, one factory.
 *
 * The thirteen seeded kinds differ in three things and share everything else: how they are
 * numbered, whether they hang off a parent, and whether AD7 gives them a detail table. Those are
 * parameters, not thirteen modules — and it matters beyond tidiness, because `document` is where
 * the composite `(id, kind)` parent key lives, and a second hand-written copy of these statements
 * is a second place for the `numbering`/`number`/`sequence` `CHECK` to be got wrong.
 *
 * **No create tool takes a number.** FR5 promises numbers are allocated monotonically and never
 * reused; a tool that accepted one would let a caller hand back a number already issued, and no
 * constraint in the schema would notice — `document_root_number` is unique per kind, but an
 * archived row's number is free again as far as that index is concerned, which is the exact case
 * FR5 names. Allocating from `number_sequence` makes the promise hold by construction rather than
 * by a rule the caller has to know.
 *
 * **Numbering and parentage are read from the seeded tables, never passed in.** Whether a kind
 * takes a parent is `document_kind_parent`'s answer, and it has to be, because the two axes are
 * independent and reading one off the other excludes a whole kind: `review` and `retro` are
 * *root*-numbered and both appear in the allow-list — a review hangs off the spec or epic it
 * reviewed, a retro off the epic, spec or quick record it followed. A factory that read "takes a
 * parent" off "is child-numbered" would build them unable to record what they were about, which
 * is the `**Source spec**` string this schema exists to remove, arriving back as an unwritable
 * column.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Context, Row, Rule, Tool } from '../convention.ts';
import type { Detail } from './detail.ts';

import { allocateNumber } from '../../numbering/allocate.ts';
import { defineTool, SUPPLIED, ToolError } from '../convention.ts';
import { insert, readById, update } from '../crud.ts';

/**
 * `document.status`'s `CHECK` set, copied by hand from `020-status-lifecycle.sql`. AD10, Story 7.
 *
 * `superseded` and `withdrawn` are terminal and user-set, and neither is completion — which is the
 * distinction `readyClause` turns on. Anything reading "not `pending`" as done is wrong for two of
 * these four.
 */
const STATUS = ['pending', 'complete', 'superseded', 'withdrawn'];

/** Columns a caller may change after creation. Identity, kind and numbering are not among them. */
const MUTABLE: Record<string, Rule> = {
  title: { type: 'string', minLength: 1 },
  slug: { type: 'string', minLength: 1 },
  status: { type: 'string', enum: STATUS },
  status_note: { type: 'string', description: 'The free-text qualifier a real epic appends' },
  archived_at: { type: 'string', description: 'ISO 8601; orthogonal to status' },
  commit_sha: { type: 'string' },

  // Waiving a retro. Both or neither — the schema's CHECK refuses one alone, so a run that names a
  // date without saying why is refused rather than storing a decision with no record of it.
  retro_waived_at: {
    type: 'string',
    description: 'ISO 8601; this document is settled without a retro. Set with a reason',
  },
  retro_waived_reason: { type: 'string', description: 'Why no retro is coming' },
};

/** How a kind is numbered, from the table the column is pinned to. */
function numberingOf(db: DatabaseSync, kind: string): string {
  const row = db.prepare('SELECT numbering FROM document_kind WHERE kind = ?')
    .get(kind) as { numbering: string } | undefined;

  if (!row) throw new Error(`documentTools: '${kind}' is not a seeded document kind`);

  return row.numbering;
}

/**
 * Whether this kind takes a parent, and whether it must have one.
 *
 * `required` follows from the schema rather than from a preference: `CHECK (numbering <> 'child'
 * OR parent_id IS NOT NULL)` makes a child-numbered document without a parent unwritable, so a
 * tool that offered the argument optionally would advertise a call that can only ever fail.
 */
function parentageOf(db: DatabaseSync, kind: string, numbering: string) {
  const allowed = (db
    .prepare('SELECT parent_kind FROM document_kind_parent WHERE kind = ? ORDER BY parent_kind')
    .all(kind) as Array<{ parent_kind: string }>)
    .map((row) => row.parent_kind);

  if (allowed.length === 0) return { mode: 'none', allowed };

  return { mode: numbering === 'child' ? 'required' : 'optional', allowed };
}

/** The detail row as read back, less the two columns that only repeat the document's identity. */
const detailFields = (row: Row) => {
  const { document_id: id, document_kind: kind, ...rest } = row;

  return rest;
};

/**
 * Build create, read and update for one document kind.
 *
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {() => string} context.now ISO 8601, injected so a test can pin it.
 * @param {() => string} context.newId
 * @param {object} options
 * @param {string} options.kind A seeded `document_kind.kind` — NFR5 reads tool names against it.
 * @param {object} [options.detail] The AD7 detail table this kind carries, if any:
 *   `{table, fields, required, row, guard}` — `row` maps validated arguments to the detail columns,
 *   and `guard` is an optional rule no constraint can hold, run inside the write's transaction.
 * @returns {object[]}
 */
export function documentTools(
  { db, now, newId }: Context,
  { kind, detail = null }: { kind: string; detail?: Detail | null },
): Tool[] {
  const create = `create_${kind}`;
  const read = `read_${kind}`;
  const modify = `update_${kind}`;

  // Read once, to shape the schema `tools/list` publishes. The handler reads `numbering` again
  // when it writes, because that column is denormalised onto `document` and pinned by a composite
  // foreign key, so the stored value has to be the one `document_kind` holds at write time. If the
  // two ever disagreed the row would be refused by the `CHECK` rather than written wrongly.
  const numbering = numberingOf(db, kind);
  const parent = parentageOf(db, kind, numbering);
  const detailFieldNames = detail ? Object.keys(detail.fields) : [];

  const createProperties: Record<string, Rule> = {
    slug: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: STATUS, default: 'pending' },
    status_note: { type: 'string' },
    ...(detail ? detail.fields : {}),
  };

  if (parent.mode !== 'none') {
    createProperties.parent_id = {
      type: 'string',
      minLength: 1,
      description: `the document this ${kind} hangs off — one of ${parent.allowed.join(', ')}`,
    };
  }

  const allocated = (
    { root: 'number', child: 'sequence' } as Record<string, string | undefined>
  )[numbering];

  const createRequired = [
    ...(parent.mode === 'required' ? ['parent_id'] : []),
    'slug',
    'title',
    ...(detail ? detail.required : []),
  ];

  return [
    defineTool({
      name: create,
      table: 'document',
      writes: detail ? ['document', detail.table] : ['document'],
      description: detail
        ? `Create a ${kind} and its ${detail.table} row together. Its number is allocated, not supplied.`
        : `Create a ${kind}. Its number is allocated, not supplied.`,
      reads: detail ? ['document', detail.table] : ['document'],
      mutates: true,
      serverSupplied: {
        id: SUPPLIED.ulid,
        kind: SUPPLIED.derived('the tool'),
        numbering: SUPPLIED.derived('document_kind'),
        ...(allocated ? { [allocated]: SUPPLIED.allocated } : {}),
        // A document that names a parent derives that parent's kind from the parent's own row; one
        // that cannot have a parent writes both columns NULL. Declared either way, because Story 7
        // asks every foreign key to be accounted for and "the tool fixes it at NULL" is an
        // account — the alternative is a column nothing in the registry admits to filling.
        ...(parent.mode === 'none'
          ? {
            parent_id: SUPPLIED.derived(`the tool — a ${kind} has no parent`),
            parent_kind: SUPPLIED.derived(`the tool — a ${kind} has no parent`),
          }
          : { parent_kind: SUPPLIED.derived('parent_id') }),
        created_at: SUPPLIED.clock,
        updated_at: SUPPLIED.clock,
        ...(detail ? { document_id: SUPPLIED.derived('the document this tool creates') } : {}),
      },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: createProperties,
        required: createRequired,
      },
      handler: (args) => {
        const live = numberingOf(db, kind);
        const parentId = parent.mode === 'none' ? null : (args.parent_id ?? null);

        // Derived, not accepted. `parent_kind` exists so a document cannot claim a parent of the
        // wrong sort; taking it as an argument would let the caller assert the very thing the
        // column was added to check. The allow-list itself is the composite foreign key's job.
        const parentKind = parentId === null ? null : readById(db, 'document', parentId, create).kind;
        const stamp = now();

        const values = {
          id: newId(),
          kind,
          numbering: live,
          number: live === 'root' ? allocateNumber(db, kind) : null,
          sequence: live === 'child' ? allocateNumber(db, kind, parentId) : null,
          slug: args.slug,
          title: args.title,
          status: args.status ?? 'pending',
          status_note: args.status_note ?? null,
          parent_id: parentId,
          parent_kind: parentKind,
          created_at: stamp,
          updated_at: stamp,
        };

        if (!detail) return insert(db, 'document', values, create);

        // **Both rows or neither.** `adr.decision` and `library_document.doc_type` are NOT NULL,
        // so a document of one of these kinds without its detail row is a half-made artefact no
        // constraint forbids and every reader has to guess at. Joining a caller's transaction
        // rather than refusing to run inside one keeps a batch of creates possible; what is not
        // optional is that the two writes share whichever transaction is open.
        const own = !db.isTransaction;

        if (own) db.exec('BEGIN');

        try {
          const row = insert(db, 'document', values, create);
          const extra = insert(db, detail.table, {
            document_id: row.id,
            ...detail.row(args),
          }, create, 'document_id');

          // Run on what was stored rather than on the arguments, and inside the transaction, so a
          // refusal takes the document row with it. A detail rule reads the row as a whole — the
          // arguments are a fragment of it on update, and the defaults are not applied to them at
          // all — so the written row is the only state worth judging.
          if (detail.guard) detail.guard(db, extra, create);

          if (own) db.exec('COMMIT');

          return { ...row, ...detailFields(extra) };
        } catch (error) {
          if (own) db.exec('ROLLBACK');
          throw error;
        }
      },
    }),

    defineTool({
      name: read,
      table: 'document',
      description: detail
        ? `Read one ${kind} by id, with its ${detail.table} columns.`
        : `Read one ${kind} by id.`,
      reads: detail ? ['document', detail.table] : ['document'],
      mutates: false,
      // FR1. Declared here rather than on the whole factory because the create and update tools
      // return the same shape and are not what the requirement is about: a skill names a document
      // it has just read or listed, and a reference on a write's return would be a second place
      // for the field to arrive from with nothing asserting the two agree.
      db,
      documentRows: true,
      // Declared empty rather than omitted: `document` holds a title, a slug and a status note,
      // and none of them is a body. A tool with nothing to withhold says so.
      body: [],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 } },
        required: ['id'],
      },
      handler: (args) => {
        const row = readById(db, 'document', args.id, read);

        // A read tool named for a kind must not answer for another one, or `read_spec` would
        // return an epic quite happily and the type in the name would mean nothing.
        if (row.kind !== kind) {
          throw new Error(`${read}: '${args.id}' is a ${row.kind}, not a ${kind}`);
        }

        if (!detail) return row;

        return { ...row, ...detailFields(readById(db, detail.table, row.id, read, 'document_id')) };
      },
    }),

    defineTool({
      name: modify,
      table: 'document',
      writes: detail ? ['document', detail.table] : ['document'],
      description: detail
        ? `Update a ${kind}'s title, slug, status, archival, commit or ${detail.table} columns.`
        : `Update a ${kind}'s title, slug, status, archival or commit.`,
      reads: detail ? ['document', detail.table] : ['document'],
      mutates: true,
      serverSupplied: { updated_at: SUPPLIED.clock },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          ...MUTABLE,
          ...(detail ? detail.fields : {}),
        },
        required: ['id'],
      },
      handler: ({ id, ...changes }) => {
        // Checked before anything is written, and not after. Thirteen kinds now share this table,
        // so `update_adr` reaching a spec is an ordinary mistake rather than a remote one —
        // and a check that ran after the `UPDATE` would refuse the call having already stamped
        // `updated_at` on a document of a kind this tool is not named for.
        const existing = readById(db, 'document', id, modify);

        if (existing.kind !== kind) {
          throw new ToolError(`${modify}: '${id}' is a ${existing.kind}, not a ${kind}`);
        }

        const own = detail && !db.isTransaction;

        if (own) db.exec('BEGIN');

        try {
          const detailChanges = Object.fromEntries(
            Object.entries(changes).filter(([column]) => detailFieldNames.includes(column)),
          );
          const documentChanges = Object.fromEntries(
            Object.entries(changes).filter(([column]) => !detailFieldNames.includes(column)),
          );

          // `updated_at` is always written, so the document `UPDATE` always has something to do —
          // which is what makes a detail-only change still stamp the document it belongs to.
          const row = update(db, 'document', id, { ...documentChanges, updated_at: now() }, modify);

          if (!detail) {
            if (own) db.exec('COMMIT');

            return row;
          }

          const touched = Object.keys(detailChanges).length > 0;
          const extra = touched
            ? update(db, detail.table, id, detailChanges, modify, 'document_id')
            : readById(db, detail.table, id, modify, 'document_id');

          // **Only a call that touched the detail is judged by the detail's rule.** A restore can
          // put a row in a state this guard forbids, and refusing a title change on the strength of
          // it would block the edit while leaving the violation exactly where it was. What is
          // refused is a call that sets the offending state, not a call that happens to arrive
          // after one.
          if (detail.guard && touched) detail.guard(db, extra, modify);

          if (own) db.exec('COMMIT');

          return { ...row, ...detailFields(extra) };
        } catch (error) {
          if (own) db.exec('ROLLBACK');
          throw error;
        }
      },
    }),
  ];
}
