/**
 * Which columns hold prose, and which of those the search index actually reaches.
 *
 * FR9 states the rule that decides what earns a place in the index — *prose a person wrote that no
 * other column can find the row by* — and the rule was right and unenforced. Eight columns across
 * six tables were indexed; the schema holds 194 TEXT columns, and `adr.decision`,
 * `audit_finding.summary` and `quick_criterion.text` were not among the eight while
 * `finding.summary` beside them was.
 *
 * **The failure has no error in it.** A search over a column nothing indexes is accepted, ranked
 * against what the index does hold, and returns nothing — which is indistinguishable from the row
 * not existing. That is register entry #26, and it is the reason this is a check rather than a
 * comment.
 *
 * Three things here, in the order they have to happen:
 *
 * 1. **`textColumns`** — every TEXT column on every table dpm authored, from `PRAGMA table_info`.
 * 2. **`indexedColumns`** — which of those the FTS triggers write, read off the triggers.
 * 3. **`CLASSIFICATION`** — what each column *holds*, which is a judgement and is the one part of
 *    this that cannot be derived. Checked against (1) in both directions, so a column a later
 *    migration adds fails until it is judged, and an entry for a column the schema no longer has
 *    fails too.
 *
 * **Both enumerations come from the live schema and neither is transcribed.** A written list is a
 * second description of the schema, and the drift is not hypothetical: the spec itself carried a
 * four-column list of what was indexed at a point when the schema indexed eight. A column added by
 * a later migration arrives in the check on the day it lands, with no edit here.
 */

import { authoredTables } from './introspection.js';

/** The two indexes. Named so a trigger belonging to neither is not mistaken for one that does. */
const INDEXES = ['document_fts', 'entry_fts'];

/**
 * Every TEXT column dpm authored, as `{ table, column, key }` sorted by key.
 *
 * `authoredTables` is what excludes the FTS virtual tables and their shadow storage — those hold
 * the index rather than the data, and a column of `entry_fts_data` is not something anyone wrote.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{table: string, column: string, key: string}[]}
 */
export function textColumns(db) {
  return authoredTables(db)
    .flatMap((table) => db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .filter((column) => column.type === 'TEXT')
      .map((column) => ({ table, column: column.name, key: `${table}.${column.name}` })))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The columns the FTS triggers index, as a set of `table.column` keys.
 *
 * **Read off `AFTER UPDATE OF <columns> ON <table>`, which is the only clause that names them.**
 * An insert trigger names its columns as `NEW.text` inside an expression that may concatenate,
 * coalesce or tag them — `entry_fts_observation_insert` writes `NEW.text || ' ' ||
 * coalesce(NEW.synthesis, '')` — and reading columns out of an expression also picks up `NEW.id`,
 * which is the UNINDEXED row pointer and not a search term. The `UPDATE OF` list is the schema's
 * own statement of which columns are indexed, and `013-entry-search.sql` says so in as many words.
 *
 * **A table indexed without an update trigger would be invisible to that parse, so it throws
 * instead.** That is the shape of miss this whole module exists to prevent — silent, and looking
 * exactly like a table with nothing to index. Story 2's three-triggers-per-table criterion is what
 * makes the condition unreachable; this is what makes it loud if it ever is reached.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Set<string>}
 */
export function indexedColumns(db) {
  const triggers = db
    .prepare("SELECT tbl_name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name")
    .all()
    .filter((trigger) => INDEXES.some((index) => (trigger.sql ?? '').includes(index)));

  const indexed = new Set();
  const named = new Set();

  for (const { tbl_name: table, sql } of triggers) {
    const update = /\bAFTER\s+UPDATE\s+OF\s+([\s\S]+?)\s+ON\s+/i.exec(sql);

    if (!update) continue;

    named.add(table);

    for (const column of update[1].split(',').map((each) => each.trim())) {
      indexed.add(`${table}.${column}`);
    }
  }

  const silent = [...new Set(triggers.map((trigger) => trigger.tbl_name))]
    .filter((table) => !named.has(table));

  if (silent.length > 0) {
    throw new Error(
      `${silent.join(', ')} carries FTS triggers with no 'AFTER UPDATE OF' among them, so which `
      + 'columns it indexes cannot be read from the schema. Add the update trigger: without it an '
      + 'edit to the indexed text leaves the index holding the old words, and every search still '
      + 'answers.',
    );
  }

  return indexed;
}

/**
 * The tables the FTS triggers fire on, which is the vocabulary `search` scopes by.
 *
 * Derived here as well as in `src/tools/search.js` rather than imported from it, for the reason
 * `introspection.js` gives for not importing `retirement.js`: a check that asked the tool which
 * tables it found could not notice the tool missing one.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {string[]}
 */
export function indexedTables(db) {
  return [...new Set([...indexedColumns(db)].map((key) => key.split('.')[0]))].sort();
}

/**
 * The columns that hold prose a person wrote, each with the reason it does.
 *
 * **The judgement, and the one thing here that is not derived.** FR9's rule is one sentence and
 * applying it to 194 columns is a decision per column, so each is written down with what it holds
 * rather than inferred from what it is called or how it is declared. Every column below is
 * declared `TEXT`, and so are all 172 that are not below — the declaration decides nothing. Nor
 * does the name: `retro_application.note` is here and `observation.note` is not,
 * `artifact.retired_reason` is here and `observation.retired_reason` is not, and in both cases the
 * column with the same name went the other way for a reason recorded against it.
 *
 * **`agent.personality` and `agent.communication_style` are the contested pair, and they are in.**
 * Both readings were available: they are prose by any measure, and they are also the two columns
 * 47-12 spent a story teaching every skill to *ask* for, which is an argument that a reader reaches
 * them by name rather than by searching. What settles it is that `name`, `display_name` and `role`
 * are labels, so nothing else on the row finds an agent by what it is like — "which of these is the
 * sceptical one" is FR9's own example shape, and today it returns nothing.
 *
 * **`story.status_note` and `task.status_note` are in, and `observation.note` beside them is not.**
 * A status note is the only prose on its row — `story` and `task` carry a title and a status and
 * nothing indexed, so "waiting on API keys" is unfindable. An observation's note qualifies a row
 * its own indexed `text` already returns, which is `EXCLUDED_PROSE` below rather than a different
 * judgement about notes. `document`'s two notes are prose on the same terms and are excluded there
 * for a third reason again: nothing can open a `document` hit.
 */
const HOLDS_PROSE = {
  'acceptance_criterion.text': 'the criterion as a person wrote it',
  'adr.decision': 'the decision an ADR exists to record, in the words it was decided in',
  'adr_option.rationale': 'why an option was worth considering — the argument, not the name',
  'agent.personality': 'what an agent is like, and nothing else on the row says it',
  'agent.communication_style': 'how an agent speaks, and nothing else on the row says it',
  'artifact.description': 'the sentence a person wrote to say what a published page is',
  'artifact.retired_reason': 'why a published page was withdrawn, written when it was',
  'coverage.retired_reason': 'why a binding was withdrawn — the only prose on a coverage row',
  'audit_finding.summary': 'the finding itself — the same content as `finding.summary` beside it',
  'audit_finding.recommendation': 'what to do about the finding, argued rather than enumerated',
  'document_section.heading': 'a section title a person wrote, and the way into its body',
  'document_section.body': 'the document itself',
  'finding.summary': 'the finding as a reviewer wrote it',
  'milestone.summary': 'what a milestone delivers, in a sentence rather than a label',
  'observation.text': 'the observation as it was captured against a story',
  'observation.synthesis': 'the same observation as rewritten when it was gathered into a retro',
  'quick_criterion.text': 'the criterion as a person wrote it, exactly as the other two kinds',
  'requirement.text': 'the requirement — the case FR9 names first',
  'retro_application.note': 'how a lesson changed a run, which is the whole content of the record',
  'story.status_note': 'the free-text qualifier a person appends to a status',
  'story_criterion.text': 'the criterion as a person wrote it',
  'task.description': 'what the task is for, and what scopes it inside its story',
  'task.status_note': 'the free-text qualifier a person appends to a status',
};

/**
 * Columns that hold prose and are still excluded, each with the fact its exclusion rests on.
 *
 * FR9's rule has two clauses and these are the second one: *prose a person wrote **that no other
 * column can find the row by***. Six columns reach it three different ways.
 *
 * **The reason is a fact the schema or the registry can be asked about, so it is falsifiable.**
 * `lapsedExclusions` puts each `depends` to the live state and complains when the answer changes:
 * drop `observation.text` from the index, or add a `read_document` tool, and the exclusion that
 * rested on it fails rather than outliving it. That is the difference between a reason and a note
 * — a reason written as prose would still read as true after it had stopped being so.
 *
 * - **`indexed-column`** — a qualifier sitting beside an indexed `NOT NULL` column on the same row.
 *   Searching for it would return a row the index already returns. Same row only, deliberately:
 *   widening it to "reachable through a foreign key" would exclude `acceptance_criterion.text`, a
 *   required child of a requirement whose text is indexed, which is the column FR9 names first.
 * - **`absent-tool`** — NFR7 makes every hit openable with `read_<entity>`, and a `document` is
 *   read through its kind (`read_spec`, `read_epic`, …). An entity named `document` would be a
 *   ranked result a caller cannot follow, which is what NFR7 exists to prevent.
 * - **`composite-key`** — `entry_fts.entity_id` holds one value and `adr_option_tradeoff`'s key is
 *   `(option_id, axis)`. There is no id to put in it, and the pair is also literally how a caller
 *   reaches the row: by listing an option's tradeoffs.
 */
const EXCLUDED_PROSE = {
  'observation.note': { on: 'indexed-column', target: 'observation.text' },
  'observation.retired_reason': { on: 'indexed-column', target: 'observation.text' },
  'story_criterion.superseded_reason': { on: 'indexed-column', target: 'story_criterion.text' },
  'quick_criterion.note': { on: 'indexed-column', target: 'quick_criterion.text' },
  'document.status_note': { on: 'absent-tool', target: 'read_document' },
  'document.retro_waived_reason': { on: 'absent-tool', target: 'read_document' },
  'adr_option_tradeoff.assessment': { on: 'composite-key', target: 'adr_option_tradeoff' },
};

/** How each `depends` reads as a sentence, and how it is put to the live state. */
const DEPENDS = {
  'indexed-column': {
    reason: (target) => `prose, but the row is already found by \`${target}\`, which is indexed`,
    lapsed: ({ indexed }, target) => !indexed.has(target),
    complaint: (target) => `\`${target}\` is not indexed`,
  },
  'absent-tool': {
    reason: (target) => `prose, but a hit would name an entity no read tool opens — there is no `
      + `\`${target}\`, and NFR7 asks that every hit be openable`,
    lapsed: ({ tools }, target) => tools.has(target),
    complaint: (target) => `\`${target}\` now exists, so the entity is openable after all`,
  },
  'composite-key': {
    reason: (target) => `prose, but \`${target}\`'s key is composite and \`entry_fts.entity_id\` `
      + 'holds one value; the row is reached by its parent and its axis',
    lapsed: ({ keys }, target) => (keys.get(target) ?? []).length < 2,
    complaint: (target) => `\`${target}\` no longer has a composite key`,
  },
};

/**
 * Why a column holds no prose. One entry per column, grouped by the reason rather than repeating
 * it — the grouping is a way of writing 169 reasons down, not a rule that produced them.
 */
const NOT_PROSE = {
  'a row identifier — a ULID, or a name that is one': [
    'acceptance_criterion.id', 'adr_option.id', 'agent.name', 'artifact.id', 'audit_finding.id',
    'coverage.id', 'dependency.id', 'dependency_kind.kind', 'document.id', 'document_kind.kind',
    'document_section.id', 'finding.id', 'milestone.id', 'observation.id', 'quick_criterion.id',
    'requirement.id', 'retro_application.id', 'session.id', 'story.id', 'story_criterion.id',
    'task.id', 'taxonomy.id', 'test_approach.tag',
  ],
  'a reference to another row, resolved by joining rather than by searching': [
    'acceptance_criterion.requirement_id', 'adr.document_id', 'adr.document_kind',
    'adr_option.adr_id', 'adr_option_tradeoff.option_id', 'artifact_document.artifact_id',
    'artifact_document.document_id', 'audit_finding.audit_id', 'audit_finding.dimension_id',
    'audit_finding.dimension_domain', 'audit_finding.severity_id', 'audit_finding.severity_domain',
    'coverage.requirement_id', 'coverage.story_criterion_id', 'coverage_story.coverage_id',
    'coverage_story.story_id', 'criterion_approach.criterion_id', 'criterion_approach.tag',
    'dependency.kind', 'dependency.source_document_id', 'dependency.source_story_id',
    'dependency.target_document_id', 'dependency.target_story_id',
    'dependency_kind_endpoint.kind', 'dependency_kind_endpoint.source_kind',
    'dependency_kind_endpoint.target_kind', 'document.kind',
    'document.parent_id', 'document.parent_kind', 'document_agent.document_id',
    'document_agent.document_kind', 'document_agent.agent', 'document_kind_parent.kind',
    'document_kind_parent.parent_kind', 'document_milestone.document_id',
    'document_milestone.milestone_id', 'document_section.document_id', 'finding.review_id',
    'finding.agent', 'finding.category_id', 'finding.category_domain', 'finding.severity_id',
    'finding.severity_domain', 'finding.remediation_task_id', 'library_document.document_id',
    'library_scope.document_id', 'milestone.spec_id', 'number_sequence.kind',
    'number_sequence.parent_id', 'observation.retro_id', 'observation.story_id',
    'observation.quick_id', 'observation.library_doc_id', 'observation_category.observation_id',
    'observation_category.taxonomy_id', 'observation_category.taxonomy_domain',
    'quick.document_id', 'quick_criterion.quick_id', 'requirement.spec_id',
    'requirement.parent_id', 'retro_application.retro_id', 'retro_application.applied_to_id',
    'review.document_id', 'review.scope_story_id', 'session.superseded_by', 'story.epic_id',
    'story_criterion.story_id', 'story_criterion.warrant_adr_id',
    'story_criterion_approach.story_criterion_id',
    'story_criterion_approach.tag', 'task.story_id',
  ],
  'a value from a closed set — a `WHERE` clause, and indexing it makes every search for "open" return every open finding': [
    'acceptance_criterion.polarity', 'adr.decision_status', 'adr_option_tradeoff.axis',
    'audit_finding.audit_kind', 'document.status', 'document.numbering',
    'document_kind.numbering', 'finding.status',
    'finding.review_kind', 'library_document.document_kind', 'library_document.doc_type',
    'library_scope.scope', 'milestone.spec_kind', 'observation.retro_kind', 'observation.quick_kind',
    'observation.library_doc_kind', 'quick.document_kind', 'requirement.spec_kind',
    'requirement.class', 'requirement.moscow', 'requirement.exclusion', 'retro_application.retro_kind',
    'retro_application.disposition', 'review.document_kind', 'review.scope', 'session.skill',
    'story.epic_kind', 'story.status', 'story_criterion.polarity', 'task.status', 'taxonomy.domain',
    'test_approach.kind',
  ],
  'a short label a reader navigates by, which the projection already prints': [
    'adr_option.name', 'agent.display_name', 'agent.icon', 'agent.role', 'artifact.title',
    'document.title', 'milestone.label', 'milestone.title', 'requirement.label',
    'retro_application.theme', 'session.phase', 'story.title', 'task.title', 'taxonomy.name',
    'taxonomy.singular',
  ],
  'an instant, in ISO 8601': [
    'agent.retired_at', 'artifact.published_at', 'artifact.retired_at', 'coverage.retired_at',
    'coverage.verified_at', 'story_criterion.superseded_at',
    'dependency_kind.retired_at', 'document.archived_at', 'document.created_at',
    'document.updated_at', 'document.retro_waived_at', 'document_section.superseded_at',
    'observation.retired_at', 'quick.closed_at', 'requirement.coverage_claimed_at',
    'schema_version.applied_at', 'session.created_at', 'session.updated_at', 'taxonomy.retired_at',
    'test_approach.retired_at',
  ],
  'a digest, which nobody searches for by content': [
    'coverage.binding_hash', 'document.commit_sha', 'requirement.coverage_claim_hash',
  ],
  'machine-written and machine-read — a path, a URL, a slug or a serialised blob': [
    'artifact.url', 'audit_finding.file', 'audit_finding.symbol', 'document.slug',
    'document_kind.dir', 'library_document.source', 'session.state',
  ],
  'a verbatim copy of prose written elsewhere, kept so a binding can be hashed — the words are searchable where they were written': [
    'coverage.spec_fragment',
  ],
  'a release version, written by the server from its own and read by comparison rather than by search': [
    'plugin_stamp.version',
  ],
};

/**
 * Every TEXT column, judged. `{ prose, reason, depends }` keyed by `table.column`.
 *
 * Built rather than written out, so a column can only appear once and a typo in a key becomes a
 * reconciliation failure against the live schema rather than a silent second entry.
 *
 * @returns {Map<string, {prose: boolean, reason: string, depends: {on: string, target: string}|null}>}
 */
export function classification() {
  const judged = new Map();

  const record = (key, entry) => {
    if (judged.has(key)) throw new Error(`${key} is classified twice`);
    judged.set(key, entry);
  };

  for (const [key, reason] of Object.entries(HOLDS_PROSE)) {
    record(key, { prose: true, reason, depends: null });
  }

  for (const [key, depends] of Object.entries(EXCLUDED_PROSE)) {
    record(key, { prose: false, reason: DEPENDS[depends.on].reason(depends.target), depends });
  }

  for (const [reason, keys] of Object.entries(NOT_PROSE)) {
    for (const key of keys) record(key, { prose: false, reason, depends: null });
  }

  return judged;
}

/**
 * The live facts every `depends` is put to — the index, the tool names, and the primary keys.
 *
 * Gathered into one value so `lapsedExclusions` takes data rather than a database, and a control
 * can plant any part of it. By the time Story 4 asserts the list is empty against the live state,
 * the live state satisfies every exclusion in it — and a check that can only be run on inputs that
 * pass cannot be shown to fail (retro 41).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{name: string}[]} tools The live registry.
 * @returns {{indexed: Set<string>, tools: Set<string>, keys: Map<string, string[]>}}
 */
export function liveFacts(db, tools) {
  const keys = new Map(authoredTables(db).map((table) => [
    table,
    db.prepare(`PRAGMA table_info(${table})`).all()
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name),
  ]));

  return { indexed: indexedColumns(db), tools: new Set(tools.map((tool) => tool.name)), keys };
}

/**
 * The columns judged to hold prose, as a sorted list of `table.column` keys.
 *
 * The one reader for the prose side, so Story 2's migration check and Story 4's reconciliation
 * agree by construction rather than by each filtering the map the same way and one of them
 * eventually not.
 *
 * @returns {string[]}
 */
export function proseColumns() {
  return [...classification()].filter(([, entry]) => entry.prose).map(([key]) => key).sort();
}

/**
 * Exclusions whose stated reason no longer holds, as complaints.
 *
 * Only the six `depends` exclusions are checkable, and that is the point of writing them that way:
 * each names a fact rather than an opinion, so it can be put to the live state. The rest are
 * judgements about what a column holds, which no query settles — they are reconciled against the
 * schema for *existence* by `classification()`'s callers, and read by a person for correctness.
 *
 * @param {{indexed: Set<string>, tools: Set<string>, keys: Map<string, string[]>}} facts
 * @param {Map<string, {prose: boolean, reason: string, depends: {on: string, target: string}|null}>} [judged]
 * @returns {string[]}
 */
export function lapsedExclusions(facts, judged = classification()) {
  return [...judged]
    .filter(([, entry]) => entry.depends && DEPENDS[entry.depends.on].lapsed(facts, entry.depends.target))
    .map(([key, entry]) =>
      `${key} is excluded on ${entry.depends.on}, and `
      + DEPENDS[entry.depends.on].complaint(entry.depends.target));
}
