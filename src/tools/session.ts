/**
 * `session` — the table that replaces the progress-file subsystem (FR11).
 *
 * What it replaces is worth naming precisely, because the subsystem was four mechanisms and this
 * is one table: session-suffixed filenames so two concurrent runs did not overwrite each other,
 * a SessionStart hook to inject the file's path, adoption on `--resume` so a new session id found
 * the old file, and compact-summary companion files. A row keyed by `CPM_SESSION_ID` removes the
 * first two outright, and the remaining two become an `UPDATE` and a `WHERE`, which is exactly
 * what FR11 says.
 *
 * **`id` is supplied by the caller and is the only tool here where that is true.** Everywhere else
 * a create tool mints a ULID, because the id is dpm's to choose. This one is not: the id *is*
 * `CPM_SESSION_ID`, issued by the harness before dpm is reached, and a session row the harness
 * cannot find by the id it already holds is a row nothing can ever adopt.
 *
 * **Adoption does not copy state forward, it points at it.** `007-artifacts-session.sql` says
 * adoption is `UPDATE session SET superseded_by = ?`, and the difference from a copy is what
 * survives: a copy leaves two rows that agree until one is written to, and a reader has no way to
 * tell which is current. The chain has one live row by construction — the one nothing supersedes.
 */

import type { Context, Tool } from './convention.ts';

import { defineTool, SUPPLIED, ToolError } from './convention.ts';
import { deleteById, insert, readById, update } from './crud.ts';
import { selectPage } from './query.ts';

/** Declared once and used by both the tool and its statement, so the two cannot disagree. */
const ORDER = ['updated_at', 'id'];

/** Everything a caller may set or change. Identity and the supersession link are not among them. */
const FIELDS = {
  skill: { type: 'string', minLength: 1, description: 'The CPM skill running, e.g. cpm:do' },
  phase: { type: 'string', minLength: 1, description: 'Where in that skill the run has reached' },
  state: { type: 'string', description: 'A JSON blob the skill defines and dpm does not read' },
};

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {() => string} context.now
 * @returns {object[]}
 */
export function sessionTools({ db, now }: Context): Tool[] {
  return [
    defineTool({
      name: 'create_session',
      table: 'session',
      description: 'Record a session under the id the harness issued. State is a skill-defined blob.',
      reads: ['session'],
      mutates: true,
      serverSupplied: { created_at: SUPPLIED.clock, updated_at: SUPPLIED.clock },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, description: 'CPM_SESSION_ID — the caller\'s, not ours' },
          ...FIELDS,
          // Declared because the table has a foreign key and AD10 asks that every one of them be
          // reachable as an argument. Adoption is the path that normally sets it, and a caller
          // setting it at creation is claiming this session is already superseded — legal, and
          // what a restore of a finished chain does.
          superseded_by: { type: 'string', minLength: 1 },
        },
        required: ['id'],
      },
      handler: (args) => {
        const stamp = now();

        return insert(db, 'session', {
          id: args.id,
          skill: args.skill ?? null,
          phase: args.phase ?? null,
          state: args.state ?? null,
          superseded_by: args.superseded_by ?? null,
          created_at: stamp,
          updated_at: stamp,
        }, 'create_session');
      },
    }),

    defineTool({
      name: 'read_session',
      table: 'session',
      description: 'Read one session by id, with its state withheld unless asked for.',
      reads: ['session'],
      mutates: false,
      // The blob is the body, and it is the reason FR13 and FR11 meet here: a progress file was
      // read whole every time anything wanted to know which skill was running.
      body: ['state'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 } },
        required: ['id'],
      },
      handler: (args) => readById(db, 'session', args.id, 'read_session'),
    }),

    defineTool({
      name: 'update_session',
      table: 'session',
      description: "Update a session's skill, phase or state. Stamps updated_at, which is what age is measured from.",
      reads: ['session'],
      mutates: true,
      serverSupplied: { updated_at: SUPPLIED.clock },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 }, ...FIELDS },
        required: ['id'],
      },
      handler: ({ id, ...changes }) => update(db, 'session', id, {
        ...changes,
        updated_at: now(),
      }, 'update_session'),
    }),

    defineTool({
      name: 'adopt_session',
      table: 'session',
      description:
        'Resume: point a predecessor at the session that continues it, and hand back the state '
        + 'it was carrying. Creates the adopting session if it does not exist yet.',
      reads: ['session'],
      mutates: true,
      serverSupplied: { created_at: SUPPLIED.clock, updated_at: SUPPLIED.clock },
      body: ['state'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, description: 'The new CPM_SESSION_ID' },
          predecessor_id: {
            type: 'string',
            minLength: 1,
            description: 'The session being resumed, which this one supersedes',
          },
        },
        required: ['id', 'predecessor_id'],
      },
      handler: (args) => {
        if (args.id === args.predecessor_id) {
          throw new ToolError('adopt_session: a session cannot supersede itself');
        }

        const predecessor = readById(db, 'session', args.predecessor_id, 'adopt_session');

        // Refused rather than re-pointed. A predecessor already superseded means either two
        // resumes of one session or a stale id being replayed, and silently moving the link would
        // orphan whichever branch lost — with no error and no way to find out afterwards.
        if (predecessor.superseded_by !== null) {
          throw new ToolError(`adopt_session: '${args.predecessor_id}' was already adopted by `
            + `'${predecessor.superseded_by}'`);
        }

        // **The adopting session may already exist**, because the harness issues the id and may
        // have recorded the row before anything asked to resume. Adoption has to reach the same
        // end either way — a resume whose state arrived only when dpm happened to create the row
        // first would work in tests and fail in the field, which is the direction the old
        // subsystem's bugs ran.
        const existing = db.prepare('SELECT * FROM session WHERE id = ?').get(args.id);

        // The one case where carrying the state forward would destroy something: a session that
        // has already written its own state is not resuming the predecessor, and overwriting it
        // would lose whatever it had done under an operation named "adopt".
        if (existing?.state !== undefined && existing?.state !== null) {
          throw new ToolError(`adopt_session: '${args.id}' already carries state of its own — `
            + 'adopting would overwrite it');
        }

        const stamp = now();
        const carried = {
          // Carried, not merely linked: the adopting session is doing the same work under a new
          // id, and a resume that forgot which skill it was running would be a resume in name.
          skill: predecessor.skill,
          phase: predecessor.phase,
          state: predecessor.state,
          updated_at: stamp,
        };

        // One transaction, because a link written without the row it points at is a foreign key
        // failure, and a row written without the link is a resume that silently forked the chain.
        db.exec('BEGIN');

        try {
          if (existing) {
            update(db, 'session', args.id, carried, 'adopt_session');
          } else {
            insert(db, 'session', {
              id: args.id, ...carried, superseded_by: null, created_at: stamp,
            }, 'adopt_session');
          }

          update(db, 'session', args.predecessor_id, { superseded_by: args.id, updated_at: stamp },
            'adopt_session');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }

        db.exec('COMMIT');

        return readById(db, 'session', args.id, 'adopt_session');
      },
    }),

    defineTool({
      name: 'list_session',
      table: 'session',
      description:
        'List sessions, newest last. `updated_before` selects stale rows by age; `superseded_by` '
        + 'is absent on the live end of every chain.',
      reads: ['session'],
      mutates: false,
      body: ['state'],
      paged: true,
      // Oldest first, which is the order a staleness sweep wants, and ending on the primary key
      // so two rows stamped in the same millisecond cannot swap places between pages.
      order: ORDER,
      // Written here rather than through the list factory because staleness is the one filter in
      // the surface that is not an equality — FR11 says staleness is a `WHERE` clause, and the
      // clause it means is `updated_at < ?`.
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skill: { type: 'string', minLength: 1 },
          updated_before: {
            type: 'string',
            minLength: 1,
            description: 'ISO 8601. Rows last touched before this — the staleness cutoff.',
          },
        },
        required: [],
      },
      handler: (args) => selectPage(db, {
        table: 'session',
        filters: { skill: args.skill },
        before: { column: 'updated_at', value: args.updated_before },
        order: ORDER,
        where: 'list_session',
      }, args),
    }),

    defineTool({
      name: 'delete_session',
      table: 'session',
      description:
        'Remove one session by id, returning the row as it was. Refused while another session '
        + 'was adopted from it, and refused if there is no such row.',
      reads: ['session'],
      mutates: true,
      // Withheld by default like every other body, but this is the one call where `include_body`
      // is the last chance to ask: after it returns there is no row left to read the blob from.
      body: ['state'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 } },
        required: ['id'],
      },
      // **One row per call, named by id, and that is the shape rather than an omission.** A sweep
      // wants a cutoff and a `DELETE … WHERE updated_at < ?` would serve it in one statement — but
      // `clean` exists to put every candidate in front of someone before anything goes, and a tool
      // taking the cutoff would let the confirmation stand for a set whose membership was decided
      // after it was given. `list_session` selects; this removes what was named.
      //
      // **The chain protects itself, in the direction that is easy to get backwards.** A
      // predecessor carries `superseded_by`, so it is the *successor* that something points at:
      // deleting the live end of a chain while its predecessor survives is refused by the foreign
      // key, and deleting the predecessor is always allowed. Oldest-first, which is the order
      // `list_session` returns and the order a staleness sweep works in, never meets the refusal —
      // and a caller reaching for the newest row alone gets an error instead of a row pointing at
      // nothing.
      handler: (args) => deleteById(db, 'session', args.id, 'delete_session'),
    }),
  ];
}
