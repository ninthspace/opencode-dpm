/**
 * `check_integrity` — FR14's sweep, callable without SQL.
 *
 * The checks are Epic 47-01's: `checkIntegrity` runs the thirteen register entries and the orphan
 * sweep, and this is a boundary over it. What FR14 adds beyond having the checks is that a
 * corrupted state must be *diagnosable* by someone who cannot open a database, and a check nobody
 * can call satisfies neither half of that.
 *
 * **The criterion is "reports every register entry it checks", and the underlying module does
 * not.** `checkIntegrity` returns `violations` filtered to the entries that produced rows, plus
 * `checked` as a count — so an entry that passed appears nowhere, and a caller reading the result
 * cannot tell a register of thirteen entries from one of three that happened to be quiet. The
 * count says how many ran; it does not say which. So the tool adds the roll: every entry by
 * number and invariant, each marked with whether it held. The count is then derivable from the
 * list rather than asserted beside it.
 *
 * That shape is the tool's, not `checkIntegrity`'s — 47-01's module and its tests are untouched.
 *
 * **This response is deliberately unbounded**, and Story 4's `limit` must not be swept onto it. A
 * truncated integrity report is precisely the false pass NFR6 forbids: the rows that fell off the
 * end are indistinguishable from rows that were never there, and the one report whose job is to
 * be trusted becomes the one that can lie by omission.
 */

import type { Context, Tool } from '../convention.ts';

import { checkIntegrity } from '../../integrity/check.ts';
import { REGISTER } from '../../integrity/register.ts';
import { currentSkew } from '../../server/neighbour.ts';
import { skewReport } from '../../server/skew.ts';
import { stampSkew } from '../../server/stamp.ts';
import { defineTool } from '../convention.ts';

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {() => object} [context.skew] The neighbour check. A parameter for the reason `now` and
 *   `newId` are: pointing it at a constructed layout is the only way to assert the field without
 *   reading whatever the author's machine happens to have installed (ENVX2).
 * @param {(db: object) => object} [context.stamp] The database-stamp check, a parameter for the
 *   same reason — this checkout's own version is whatever `package.json` says today, so a test that
 *   could not name it could assert only that the two agree.
 * @returns {object[]}
 */
export function integrityTools({ db, skew = currentSkew, stamp = stampSkew }: Context): Tool[] {
  return [
    defineTool({
      name: 'check_integrity',
      // NFR5's rule — every part after the verb is a table name, a column name or a seeded
      // `document_kind.kind` — has no word for a tool that spans tables, and `integrity` is not
      // one. Named for what it does rather than bent to the regex; Story 5 decides whether to
      // widen the rule or rename, and the epic's Notes carry the reasoning.
      table: 'sqlite_schema',
      description:
        'Report orphaned rows and every cross-row invariant in the register, with the rows that '
        + 'locate each violation. Deliberately unbounded.',
      reads: ['sqlite_schema'],
      mutates: false,
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      handler: () => {
        const report = checkIntegrity(db);
        const failed = new Map(report.violations.map((violation) => [violation.entry, violation]));

        // Every entry, not only the ones that failed. Derived from `REGISTER` so an entry added
        // to the register appears here without this file being edited — which is the same
        // property the parity test in 47-01 asserts, arriving at the tool boundary for free.
        // `advisory` travels with the entry, because "not held" means two different things and a
        // reader cannot tell them apart from the row: a broken invariant is a fault, and an
        // advisory finding is a decision somebody recorded. Without the flag here, `ok: true`
        // beside an entry that did not hold reads as a contradiction rather than as the answer.
        const entries = REGISTER.map(({ entry, invariant, advisory }) => ({
          entry,
          invariant,
          advisory: advisory === true,
          held: !failed.has(entry),
          rows: failed.get(entry)?.rows ?? [],
        }));

        // **The one thing in this report that is not about the data.** A stale server under-seeds
        // and under-reports without failing anything, and the only component positioned to notice
        // is the stale server itself — every other part of a fresh session is fresh. Nothing in a
        // Claude session reads MCP stderr, so a tool response is the only channel that arrives.
        //
        // Two checks, because there are two ways to be stale and they are independent: a newer
        // release installed beside this one, and a newer release having written this database from
        // someone else's machine. Either can hold without the other.
        const verdicts = [skew(), stamp(db)];

        return {
          // **Untouched, and deliberately.** `ok` says the database is internally consistent, and
          // under a skew it still is: the rows are sound and the reader is stale. Folding the two
          // together would make a diagnostic about the process indistinguishable from a finding
          // about the data, and would fire the integrity alarm on every session running an older
          // plugin against a perfectly good database.
          ok: report.ok,
          // Kept from `checkIntegrity` rather than recomputed, so the two cannot drift about what
          // counts as a check. The orphan sweep is the one that is not a register entry, which is
          // why this is one greater than the list below.
          checked: report.checked,
          entries,
          orphans: report.orphans,
          // Top-level, beside `entries` and `orphans` rather than inside either (AD1). `entries` is
          // derived from `REGISTER` and held to it by a parity test; a skew in there would be a
          // fabricated register entry or a broken derivation, and both read as corruption.
          //
          // Present in every state, including `none`. A reader can then tell a check that ran and
          // found nothing from a server too old to know how to check at all — the field's absence
          // means the second, and the second is what this whole spec is about.
          //
          // **One field for two checks**, shaped by `skewReport` rather than here — a read-only
          // launch reports the same two verdicts by a different route, and one shape built in two
          // places is how two responses start describing one session differently.
          //
          // Note for the next author: the phrase above is deliberately unquoted. `server.test.js`
          // sweeps every source file for import specifiers textually, and a quoted phrase after the
          // word from reads to it as a dependency on a package by that name. It failed the suite
          // when this comment was first written.
          skew: skewReport(verdicts),
        };
      },
    }),
  ];
}
