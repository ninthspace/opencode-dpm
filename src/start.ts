/**
 * Server start.
 *
 * FR12's requirement is that a plugin update "never requires the user to intervene", and every
 * one of Story 5's criteria is phrased as *on the next server start*. That phrase needs
 * somewhere to be true: three steps in a fixed order, in one function, so that "start" is a
 * thing the tests can call rather than a sequence each caller assembles for itself. Epic 47-03's
 * MCP server calls this and does nothing else to the database before serving.
 *
 * The order is not interchangeable. Migrations create the tables the vocabulary is inserted
 * into, so a release that adds both a table and a term for it works only this way round; and
 * the connection has to enforce foreign keys before either, or the whole schema is advisory
 * for the duration of the upgrade.
 *
 * **Four steps since Epic 2, and the fourth is last for the same kind of reason.** The stamp is
 * written into a table a migration creates, so it cannot precede `migrate`; and it records that
 * this server *wrote* here, which is only true once the writing has happened.
 */

import { openConnection } from './db/connection.ts';
import { migrate } from './schema/migrate.ts';
import { applyVocabulary } from './schema/seeds/index.ts';
import { stampPlugin } from './server/stamp.ts';
import type { Retirement, Vocabulary } from './schema/seeds/index.ts';

/**
 * One bag of options, spread across three steps that each read their own keys.
 *
 * Composed from what those steps accept rather than restated: `start` passes the same object to
 * all three and knows what none of the keys mean, so a list written here would be a fourth
 * opinion about three other modules' parameters.
 */
type StartOptions = {
  now?: string;
  version?: string | null;
  vocabularies?: Vocabulary[];
  retirements?: Retirement[];
};

/**
 * Open a database, bring it up to date, and hand it back ready to serve.
 *
 * @param location A file path, or `:memory:`.
 * @param options Passed through to the two update steps, which is how a test drives an upgrade
 *   carrying a release's worth of change without having a second release to hand.
 * @returns The steps report what they did, because "started" and "started and did nothing" are the
 *   same observation otherwise (NFR6).
 */
export function start(location: string, options: StartOptions = {}) {
  const db = openConnection(location);
  const migrated = migrate(db, options);

  // A database this plugin is too old for gets none of the write steps. Seeding is an insert into
  // vocabulary tables whose shape a later release may have changed, and the guards are derived from
  // a schema this server can only see part of; both are how an older release would damage a newer
  // database while believing it had done nothing. See `migrate.js`.
  //
  // **The stamp is skipped here for a reason of its own, on top of that one.** A database ahead of
  // this server was last written by a plugin newer than this one, so the stamp already holds a
  // version above ours — `stampPlugin` would decline the write anyway. It is skipped rather than
  // left to decline because the table may not exist: a database from a release before the stamp
  // migration is *behind* rather than ahead, but a database from far enough ahead could have had it
  // renamed, and a `SELECT` against a table that is not there throws.
  const skipped = { skipped: 'schema version is ahead of this server' };

  return {
    db,
    migrated,
    ahead: migrated.ahead,
    vocabulary: migrated.ahead ? skipped : applyVocabulary(db, options),
    stamp: migrated.ahead ? skipped : stampPlugin(db, options),
  };
}
