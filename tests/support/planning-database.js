/**
 * A database with the schema applied, the creators registered and the kind vocabulary
 * seeded — the starting point almost every Story 1 test shares.
 *
 * It sits in `support/` rather than in `fixtures/` because it opens a database, which is the
 * harness's job. What it seeds is dpm's own vocabulary, applied by the same `applyVocabulary`
 * a real project gets on every server start — so a test that passes against a term the
 * release does not carry fails here rather than in the field.
 */

import { openDatabase } from './database.js';
import { registerCreators } from './creators.js';
import { applySchema } from '../../src/schema/index.ts';
import { applyVocabulary } from '../../src/schema/seeds/index.ts';

/**
 * @param {import('node:test').TestContext} t
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function openPlanningDatabase(t) {
  registerCreators();

  const db = applySchema(openDatabase(t));
  applyVocabulary(db);

  return db;
}

/**
 * The tools as a plain dispatcher, keyed by name — the second half of that starting point, since a
 * registry is a list and every test calls it as a map.
 *
 * It lives beside the database rather than in `support/skills.js` because it belongs to any test
 * that opens one, and the skill tests are only where the *distinction* it draws matters. There,
 * `recorder` wraps the same handlers and records what the run called, and the binding then holds
 * that set to what the SKILL.md names — so every read the *test* performs to check the result, and
 * every write it makes to seed a fixture, has to go through this instead. Otherwise the binding
 * fails on a call the test invented rather than on anything the skill got wrong.
 *
 * @param {object[]} tools
 * @returns {Record<string, Function>}
 */
export function handlers(tools) {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool.handler]));
}
