/**
 * Retiring a term, for the tests that need one retired.
 *
 * This is an `UPDATE`, and the fixture seam only creates — Epic 47-03's update tools do not
 * exist yet and `create()` is deliberately not a general write path. So it lives in
 * `support/`, beside the creators, under the same rule: the code with SQL in it sits here and
 * `tests/fixtures/` stays free of it.
 *
 * It writes `retired_at` and nothing else. Retirement is not a delete and not a status change
 * — the row stays, its references stay resolvable, and the only thing that changes is whether
 * a *new* row may point at it.
 */

import { VOCABULARIES } from '../../src/schema/seeds/index.ts';

/**
 * A seeded taxonomy domain's terms, in the order the domain positions them.
 *
 * **Read from the shipped seed rather than transcribed** — the rule spec 50's AD3 states for the
 * skills is the same one that has to hold for the tests checking them: a list written out beside
 * an assertion is a second copy of a vocabulary that projects extend, and the file carrying it is
 * the one that never learns the vocabulary moved. Three suites now need the disposition terms and
 * every story left in spec 50 adds another.
 *
 * Domains whose *membership* is the claim — where the point is that these four terms and no others
 * arrived — transcribe their own enumeration instead and reconcile the two. That is a different
 * question from this one, and `vocabulary.test.js` asks it.
 *
 * @param {string} domain
 * @returns {object[]}
 */
export function domainTerms(domain) {
  const rows = VOCABULARIES.find(({ table }) => table === 'taxonomy').rows
    .filter((row) => row.domain === domain)
    .sort((a, b) => a.position - b.position);

  // A misspelt domain would otherwise return nothing, and every sweep driven off it would pass
  // over the empty set — which is exactly the absence that asserts nothing.
  if (rows.length === 0) throw new Error(`no seeded terms in the '${domain}' domain`);

  return rows;
}

/**
 * What is wrong with a skill section that claims to report by disposition — as problems, so the
 * same reading runs against a section deliberately broken.
 *
 * **The four checks here are the part every site shares**, and a site's own derivation is asserted
 * beside this call rather than inside it: `quick` derives from a tri-state column, `review` from a
 * foreign key, `pivot` from which criteria moved, `audit` from whether a recommendation exists. A
 * helper that tried to cover those too would take a pattern per caller and stop being shared.
 *
 * The label sweep is the reason this is worth having in one place. It is the same must-NOT at eight
 * sites, and a per-file copy is eight chances for it to be written slightly weaker.
 *
 * @param {string} body The section, from `section()`.
 * @param {string} [label] What to call the site in a failure.
 * @returns {string[]}
 */
export function dispositionProblems(body, label = 'the section') {
  const problems = [];
  const terms = domainTerms('disposition');

  if (!/`disposition` domain/.test(body)) {
    problems.push(`${label} reports dispositions without naming the domain they come from`);
  }

  if (!/mcp__plugin_dpm_dpm__list_taxonomy/.test(body)) {
    problems.push(`${label} names the domain but never reads it, so the terms come from elsewhere`);
  }

  if (!/`position` order/.test(body)) {
    problems.push(`${label} leaves the render order to the writer, so the actionable block can land first`);
  }

  for (const { name } of terms) {
    if (body.includes(name)) {
      problems.push(`${label} hardcodes the label '${name}' instead of reading it from the domain`);
    }
  }

  return problems;
}

/** The column each vocabulary is keyed on. */
const KEY = {
  taxonomy: 'id',
  agent: 'name',
  test_approach: 'tag',
  dependency_kind: 'kind',
  observation: 'id',
};

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {keyof KEY} table
 * @param {string} key
 * @param {string} [at]
 * @returns {object} The retired row, read back.
 */
export function retire(db, table, key, at = '2026-08-08T00:00:00Z') {
  const column = KEY[table];

  if (!column) {
    throw new Error(`no retirement key known for ${table} — add it to vocabulary.js`);
  }

  const changes = db
    .prepare(`UPDATE ${table} SET retired_at = ? WHERE ${column} = ?`)
    .run(at, key).changes;

  // A typo in a term name would otherwise retire nothing and leave the test asserting that a
  // live term behaves like a live term, which passes.
  if (changes !== 1) {
    throw new Error(`retiring ${table}.${column} = ${key} matched ${changes} rows, not 1`);
  }

  return db.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`).get(key);
}
