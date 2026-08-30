/**
 * The write path the MCP tools will later own, registered on the fixture seam.
 *
 * These live in `tests/support/` rather than in `tests/fixtures/` deliberately. The fixture
 * layer's rule is that nothing but `tool-surface.js` issues statements, and these *are*
 * statements — they are the seam's implementation, which is what `defineCreator()` exists to
 * accept from outside `create()`. Epic 47-03 deletes this module: `create()` starts calling
 * MCP tools and the fixtures that call `create()` never notice.
 *
 * Creators are deliberately thin. They fill in an id and the columns every row needs, and
 * otherwise write what they are given — including values the schema will reject. A creator
 * that derived `parent_kind` from the parent it was handed would make the criterion about a
 * `parent_kind` that misdescribes its parent untestable through the seam, which is the one
 * write path a fixture is allowed to use.
 */

import { defineCreator, registeredCreators } from '../fixtures/tool-surface.js';
import { ulid } from '../../src/id/ulid.ts';

/** Stamped on every row that carries timestamps, so fixtures do not each invent one. */
const EPOCH = '2026-01-01T00:00:00Z';

/**
 * Build a creator that inserts one row and returns it as stored.
 *
 * The row is read back rather than echoed, so a `DEFAULT` the schema applied is visible to
 * the test instead of being replaced by the value the fixture happened to omit.
 *
 * @param {string} table
 * @param {() => object} [defaults] Evaluated per call, since ids and timestamps differ per row.
 */
function writes(table, defaults = () => ({})) {
  return (db, attributes) => {
    const row = { ...defaults(), ...attributes };
    const columns = Object.keys(row);

    const written = db
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .run(...columns.map((column) => row[column]));

    return db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`).get(written.lastInsertRowid);
  };
}

const CREATORS = {
  document_kind: writes('document_kind', () => ({ dir: null, numbering: 'root' })),
  document_kind_parent: writes('document_kind_parent'),

  document: writes('document', () => ({
    id: ulid(),
    numbering: 'root',
    number: null,
    sequence: null,
    slug: 'slug',
    title: 'Title',
    parent_id: null,
    parent_kind: null,
    created_at: EPOCH,
    updated_at: EPOCH,
  })),
  document_section: writes('document_section', () => ({ id: ulid(), position: 1 })),

  library_document: writes('library_document', () => ({ doc_type: 'architecture' })),
  adr: writes('adr', () => ({ decision: 'Decided.' })),
  quick: writes('quick'),
  review: writes('review'),

  requirement: writes('requirement', () => ({
    id: ulid(),
    label: 'FR1',
    class: 'functional',
    text: 'The system shall.',
    position: 1,
  })),

  story: writes('story', () => ({ id: ulid(), number: 1, title: 'Story', position: 1 })),
  story_criterion: writes('story_criterion', () => ({ id: ulid(), text: 'Criterion', position: 1 })),
  coverage: writes('coverage', () => ({ id: ulid(), position: 1 })),
  coverage_story: writes('coverage_story'),

  adr_option: writes('adr_option', () => ({ id: ulid(), name: 'Option', chosen: 0, position: 1 })),

  session: writes('session', () => ({
    id: ulid(), superseded_by: null, created_at: EPOCH, updated_at: EPOCH,
  })),

  milestone: writes('milestone', () => ({ id: ulid(), label: 'M1', title: 'Milestone', position: 1 })),
  document_milestone: writes('document_milestone'),

  observation: writes('observation', () => ({ id: ulid(), text: 'Observation' })),
  observation_category: writes('observation_category'),

  acceptance_criterion: writes('acceptance_criterion', () => ({
    id: ulid(),
    text: 'The system shall be verified.',
    position: 1,
  })),
  criterion_approach: writes('criterion_approach'),
  story_criterion_approach: writes('story_criterion_approach'),

  document_agent: writes('document_agent', () => ({ document_kind: 'review' })),

  // Every end defaults to NULL so a test can name exactly the two it means, including the
  // combinations the CHECKs are there to refuse.
  dependency: writes('dependency', () => ({
    id: ulid(),
    kind: 'blocks',
    source_document_id: null,
    source_story_id: null,
    target_document_id: null,
    target_story_id: null,
  })),

  // `category_domain`, `severity_domain` and `dimension_domain` are left to their schema
  // defaults, so a test that puts a severity in a category slot writes only the id — which is
  // the shape the criterion is about, and the one an MCP tool will present.
  finding: writes('finding', () => ({ id: ulid(), position: 1, summary: 'A finding.' })),
  audit_finding: writes('audit_finding', () => ({
    id: ulid(),
    position: 1,
    file: 'src/thing.js',
  })),
};

/**
 * Register every creator the substrate needs. Idempotent, because `node --test` gives each
 * file its own process but a file may import this module more than once.
 *
 * @returns {string[]} The entities the seam can create, for a test that wants to assert it.
 */
export function registerCreators() {
  if (registeredCreators().length === 0) {
    for (const [entity, creator] of Object.entries(CREATORS)) defineCreator(entity, creator);
  }

  return registeredCreators();
}
