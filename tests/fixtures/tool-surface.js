/**
 * THE SEAM.
 *
 * This module is the only place in the fixture layer that talks to a database. Every
 * fixture is built by calling `create()` here; nothing else under `tests/fixtures/` may
 * import `node:sqlite`, prepare a statement, or execute SQL. `fixtureDisciplineBypasses()`
 * in `../support/fixture-discipline.js` fails the suite when something does.
 *
 * Why it is one module rather than a convention: Epic 47-03 ships the MCP tools that own
 * these writes, and at that point `create()` stops issuing statements and starts issuing
 * tool calls. Confining the change to this file makes that substitution one edit instead of
 * a rewrite of every fixture — the fixtures keep calling `create(db, 'epic', {...})` and
 * never learn which side of the seam answered.
 *
 * There is deliberately no markdown path in or out. AD8 starts every project with an empty
 * database, so no import path exists to exercise; a fixture parsed from a file would be
 * testing a code path dpm does not have.
 */

/** @typedef {(db: import('node:sqlite').DatabaseSync, attributes: object) => object} Creator */

/** @type {Map<string, Creator>} */
const creators = new Map();

/**
 * Register the creator for one entity. Stories 1 onwards call this as their tables land —
 * each creator issuing the statements the matching MCP tool will later wrap.
 *
 * @param {string} entity Entity name as the tool surface will name it, e.g. `'epic'`.
 * @param {Creator} creator
 */
export function defineCreator(entity, creator) {
  if (creators.has(entity)) {
    throw new Error(`Creator for '${entity}' is already defined; a second one would make which write path a fixture exercises depend on import order.`);
  }
  creators.set(entity, creator);
}

/**
 * Create one entity through the tool surface and return the row as written.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} entity
 * @param {object} [attributes]
 * @returns {object}
 */
export function create(db, entity, attributes = {}) {
  const creator = creators.get(entity);
  if (!creator) {
    const known = registeredCreators();
    throw new Error(
      `No creator registered for '${entity}'. ${known.length ? `Known: ${known.join(', ')}.` : 'None are registered yet.'} ` +
        'A fixture may not reach past this module to write the row itself.',
    );
  }
  return creator(db, attributes);
}

/** The entities the seam can currently create. Read by the parity checks in later stories. */
export function registeredCreators() {
  return [...creators.keys()].sort();
}

/** Drop every registration. For tests that exercise the seam itself. */
export function resetCreators() {
  creators.clear();
}
