/**
 * The four vocabularies, and the three joins that attach them to things.
 *
 * FR24 asks for every controlled vocabulary to be "seeded with defaults, extensible per project,
 * and retirable without invalidating rows that already use them". Epic 47-01 Story 2 built the
 * schema half and the retirement guards — `retirement.js` derives a trigger per referencing column
 * so that a retired term keeps its existing rows and refuses new ones. What was missing is the
 * only thing that makes any of it a *feature*: a way to add and retire a term without SQL.
 *
 * **`agent` is the case that motivated the requirement's evolution clause.** CPM's roster is
 * `agents/roster.yaml`, and a file can only be overridden by replacing it — so adding one persona
 * means forking all ten and maintaining the fork against every release. Append is the operation
 * projects actually perform and the one the file cannot express. Here it is a row.
 *
 * **Retirement is its own tool, and `retired_at` is not an updatable column.** Offered through the
 * update tool it would be a column like any other, and clearing it would be as easy as setting it —
 * which would make a retirement something a mistyped update could quietly undo. A separate verb
 * for a decision with consequences is the point; un-retirement is deliberately not offered, since
 * no requirement asks for it and a term retired in error can be superseded by a new one.
 *
 * **A vocabulary term's key is the term.** Three of the four key on the word itself — an agent's
 * `name`, a test approach's `tag`, a dependency kind's `kind` — and `taxonomy` keys on an id whose
 * seeded form is `<domain>:<slug>`. None of them is a ULID, and that is deliberate: AD9 mints
 * ULIDs because ids only have to be unique, while these have to mean the same thing in two
 * databases that never met. FR24's migration channel inserts a term that is absent, which is a
 * comparison against a key — a minted id would make every project's `Testing Gaps` a different row
 * and leave the migration keying on the name anyway, with an indirection in front of it.
 */

import type { Args, Context, Tool } from './convention.ts';
import type { EntitySpec } from './entity.ts';

import { defineTool, SUPPLIED, ToolError } from './convention.ts';
import { readByKey, updateByKey } from './crud.ts';
import { entityTools } from './entity.ts';

/** `test_approach.kind`'s `CHECK` set, copied by hand from `008-vocabularies.sql`. */
const APPROACH_KIND = ['level', 'mode'];

/**
 * Create, read, update and retire for one vocabulary table.
 *
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {() => string} context.now
 * @param {() => string} context.newId
 * @param {object} options As `entityTools` takes them, less `key`, which is required here.
 * @returns {object[]}
 */
function vocabularyTools(
  context: Context,
  options: EntitySpec & { key: string[] },
): Tool[] {
  const { db, now } = context;
  const { table, noun, key } = options;

  return [
    ...entityTools(context, options),

    defineTool({
      name: `retire_${table}`,
      table,
      description: `Retire ${noun}. Rows already referencing it stay intact and readable; new `
        + 'rows referencing it are refused. Not reversible through the tools.',
      reads: [table],
      mutates: true,
      serverSupplied: { retired_at: SUPPLIED.clock },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(key.map((column) => [column, options.fields[column]])),
        required: key,
      },
      handler: (args) => {
        const where = `retire_${table}`;
        const identity = Object.fromEntries(key.map((column) => [column, args[column]]));

        // Reported rather than silently rewriting the timestamp. Retiring twice is almost always a
        // caller that has lost track, and moving the date would erase when the decision was made.
        const row = readByKey(db, table, identity, where);

        if (row.retired_at !== null) {
          throw new ToolError(`${where}: already retired at ${row.retired_at}`);
        }

        return updateByKey(db, table, identity, { retired_at: now() }, where);
      },
    }),
  ];
}

/**
 * @param {object} context
 * @returns {object[]}
 */
export function vocabularies(context: Context): Tool[] {
  return [
    ...vocabularyTools(context, {
      table: 'taxonomy',
      noun: 'a controlled term — an observation category, finding category, audit dimension, severity or report disposition',
      key: ['id'],
      fields: {
        id: {
          type: 'string',
          minLength: 1,
          description: "the stable term id, '<domain>:<slug>' — the same in every database",
        },
        domain: {
          type: 'string',
          minLength: 1,
          description: "'observation', 'finding', 'audit_dimension', 'severity' or 'disposition'",
        },
        name: { type: 'string', minLength: 1, description: "canonical form, e.g. 'Testing Gaps'" },
        singular: { type: 'string', description: 'per-item display form, where it differs' },
        position: { type: 'integer', minimum: 0 },
      },
      required: ['domain', 'name', 'position'],
      mutable: ['name', 'singular', 'position'],
      // **`domain` is not updatable, and that is the one restriction worth stating.** Every
      // reference to this table is domain-scoped by a composite key so that a severity cannot fill
      // a category slot; moving a term between domains would carry its rows across that boundary
      // with it, which is the drift the scoping exists to prevent.
      guard: (args: Args) => {
        if (!args.id.startsWith(`${args.domain}:`)) {
          throw new ToolError(
            `create_taxonomy: id '${args.id}' does not begin with '${args.domain}:'. The `
            + 'seeded terms are keyed that way so a term means the same thing in two databases, '
            + 'and FR24\'s migration channel compares on that key.',
          );
        }
      },
    }),

    ...vocabularyTools(context, {
      table: 'agent',
      noun: 'a persona the party, review and consult rosters offer',
      key: ['name'],
      fields: {
        name: { type: 'string', minLength: 1, description: "the id skills reference, e.g. 'architect'" },
        display_name: { type: 'string', minLength: 1, description: "'Margot' — unique, or rendered output is ambiguous" },
        icon: { type: 'string', minLength: 1, description: 'a single emoji, the party-mode prefix' },
        role: { type: 'string', minLength: 1, description: "'Architect'" },
        // Prose that nothing filters on, and columns anyway: a project-added persona needs
        // somewhere to put its own, and keeping them in a plugin file keyed by name breaks the
        // append case the table exists for.
        personality: { type: 'string', minLength: 1 },
        communication_style: { type: 'string', minLength: 1 },
        position: { type: 'integer', minimum: 0 },
      },
      required: ['display_name', 'icon', 'role', 'personality', 'communication_style', 'position'],
      mutable: ['display_name', 'icon', 'role', 'personality', 'communication_style', 'position'],
      body: ['personality', 'communication_style'],
    }),

    ...vocabularyTools(context, {
      table: 'test_approach',
      noun: 'a test approach tag',
      key: ['tag'],
      fields: {
        tag: { type: 'string', minLength: 1, description: "'unit', 'integration', 'feature'…" },
        kind: {
          type: 'string',
          enum: APPROACH_KIND,
          description: "'level' is how much is under test; 'mode' is how it is run",
        },
        position: { type: 'integer', minimum: 0 },
      },
      required: ['kind', 'position'],
      mutable: ['kind', 'position'],
    }),

    ...vocabularyTools(context, {
      table: 'dependency_kind',
      noun: 'a kind of edge between two artefacts',
      key: ['kind'],
      fields: {
        kind: { type: 'string', minLength: 1, description: "'blocks', 'builds_on', 'supersedes'…" },
        // The flag that separates the edge which stops work from the ones that only record
        // lineage, so readiness is a query over a column rather than a hardcoded list of kinds.
        gates_work: { type: 'boolean', default: false, description: 'whether this edge blocks readiness' },
        position: { type: 'integer', minimum: 0 },
      },
      required: ['position'],
      mutable: ['gates_work', 'position'],
    }),
  ];
}

/**
 * The three joins that attach a vocabulary to the thing it describes.
 *
 * They are here rather than beside their owning tables because what makes them awkward is the
 * vocabulary end, not the owning end: each is guarded by a retirement trigger derived from the
 * reference, so attaching a retired term is refused by the database and the refusal names it.
 *
 * `observation_category` is the one FR24's second promise rests on. Real observations were forced
 * into invented compounds — `Testing gap / pattern`, `Pattern reuse + testing` — because the format
 * allowed one category and the work spanned two. A join allows two; a column never could.
 *
 * @param {object} context
 * @returns {object[]}
 */
export function vocabularyJoins(context: Context): Tool[] {
  return [
    ...entityTools(context, {
      table: 'observation_category',
      noun: 'one category of an observation',
      key: ['observation_id', 'taxonomy_id'],
      fields: {
        observation_id: { type: 'string', minLength: 1 },
        taxonomy_id: { type: 'string', minLength: 1, description: "a taxonomy row in the 'observation' domain" },
      },
    }),

    ...entityTools(context, {
      table: 'criterion_approach',
      noun: "one test approach of a spec's acceptance criterion",
      key: ['criterion_id', 'tag'],
      fields: {
        criterion_id: { type: 'string', minLength: 1 },
        tag: { type: 'string', minLength: 1, description: 'a seeded test_approach.tag' },
      },
    }),

    ...entityTools(context, {
      table: 'story_criterion_approach',
      noun: "one test approach of a story's criterion",
      key: ['story_criterion_id', 'tag'],
      fields: {
        story_criterion_id: { type: 'string', minLength: 1 },
        tag: { type: 'string', minLength: 1, description: 'a seeded test_approach.tag' },
      },
    }),
  ];
}
