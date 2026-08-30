/**
 * The fixture corpus.
 *
 * Fixtures are built by calling the tool surface, never by parsing a file. Everything here
 * goes through `create()` from `./tool-surface.js`; this module holds no SQL and opens no
 * database of its own.
 *
 * Compositions arrive as the schema does — Story 1 brings `document` and its detail tables,
 * Story 2 the vocabularies — and each one is a call to `create()` per entity, in dependency
 * order, so the fixture reads as the sequence of tool calls a skill would have made.
 */

export { create, registeredCreators } from './tool-surface.js';
