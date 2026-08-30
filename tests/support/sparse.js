/**
 * A corpus of absence and endings — the complement to `self-hosting.js`.
 *
 * Every other fixture in this directory fills things in. `self-hosting.js` populates nearly every
 * optional column because its job is completeness; `corpus.js` and `tool-corpus.js` write one
 * well-formed row per table so a renderer and a parity sweep have something to find. The result is
 * that the whole tree exercises presence, and the templates are full of branches that only run on
 * absence — `x === null ? null : …`, `x.length > 0 ? … : null` — which nothing reaches.
 *
 * So this corpus is built the other way round:
 *
 * - **Absence.** One document of every kind carrying only the fields its create tool requires, with
 *   no children at all; and a second set carrying one of every child type, each of *those* also
 *   created with required fields only. The two are separate parents because they contradict — a
 *   parent cannot both have no children and have bare ones.
 * - **Endings.** Every terminal state the schema admits, reached through the tools: each terminal
 *   `status` value on `document`, `story` and `task`, each terminal `adr.decision_status`, the
 *   `rejected`/`remediated` end of `finding.status`, and every retirement column — `archived_at`,
 *   `retired_at`, `superseded_at`, `closed_at`, `superseded_by`. The four vocabulary retirements
 *   are applied *after* rows reference them, which is the order that matters: retiring a term must
 *   preserve the rows that already point at it while refusing new ones.
 *
 * **What is recorded, and why.** `calls` holds the arguments every create call was made with, so a
 * test can assert against the live `inputSchema` that no optional field was set anywhere — which is
 * the claim this corpus exists to support, and it is derived rather than promised in a comment. A
 * new optional field on any create tool is covered the moment it is declared.
 */

const AT = '2026-04-01T00:00:00.000Z';

/**
 * Wrap the handlers so every call records the arguments it was given.
 *
 * A Proxy rather than a wrapper per tool, because the point is to catch *every* call including ones
 * added later — a hand-wrapped subset would record exactly the tools someone remembered, which is
 * the shape of gap this corpus is written to find.
 */
function recording(call) {
  const calls = [];
  const at = new Proxy({}, {
    get: (_target, name) => {
      if (typeof name !== 'string') return undefined;
      return (args) => {
        calls.push({ name, args: args ?? {} });
        return call[name](args);
      };
    },
  });

  return { calls, at };
}

/**
 * Build the corpus.
 *
 * @param {Record<string, Function>} call raw tool handlers, as `handlers(spineTools(db))` returns
 * @returns {object} the corpus, keyed, plus `calls` and the terminal states it claims to reach
 */
export function sparseCorpus(call) {
  const { calls, at } = recording(call);

  // --- Absence, part one: every kind, required fields only, no children ------------------------

  // These parents stay childless for the whole run. Nothing below adds to them, and a test that
  // wants a populated parent uses the second set.
  const barren = {};
  const bare = (tool, extra = {}) => {
    const kind = tool.replace(/^create_/, '');
    barren[kind] = at[tool]({ slug: `barren-${kind}`, title: `Barren ${kind}`, ...extra });
    return barren[kind];
  };

  bare('create_problem_brief');
  bare('create_product_brief');
  bare('create_spec');
  bare('create_epic', { parent_id: barren.spec.id });
  bare('create_coverage_matrix', { parent_id: barren.epic.id });
  // An ADR is the one kind whose create tool requires a narrative field of its own, and it is left
  // `proposed` — an accepted one must carry a chosen option, so "accepted with no options" is a
  // state the write boundary refuses rather than one this corpus can hold.
  bare('create_adr', { parent_id: barren.spec.id, decision: 'Left undecided.' });
  bare('create_review');
  bare('create_retro');
  bare('create_audit');
  bare('create_quick');
  bare('create_discussion');
  bare('create_communication');
  bare('create_runbook');
  bare('create_library', { doc_type: 'reference' });

  // --- Absence, part two: one of every child type, each with its optional columns unset ---------

  const spec = at.create_spec({ slug: 'sparse-spine', title: 'The sparse spine' });

  at.create_document_section({
    document_id: spec.id, heading: 'Context', body: 'One paragraph.', position: 0,
  });

  // `summary` unset.
  const milestone = at.create_milestone({
    spec_id: spec.id, label: 'M1', title: 'The first milestone', position: 0,
  });

  // `moscow` and `exclusion` unset — a requirement that states neither priority nor exclusion is
  // the ordinary case in a first draft, and the template branches on both.
  const requirement = at.create_requirement({
    spec_id: spec.id, label: 'FR1', class: 'functional', text: 'The thing works.', position: 0,
  });
  const criterion = at.create_acceptance_criterion({
    requirement_id: requirement.id, text: 'It works.', position: 0,
  });

  // A requirement carrying no acceptance criteria at all — the empty-collection case one level
  // below the empty document. Added after a mutation on the template's own `criteria.length > 0`
  // guard turned out to be a no-op: the corpus had no requirement without criteria, so the guard
  // was never reached, and the block assembler drops the empty string anyway. The row is here so
  // the branch has an input, whether or not the guard is what stops it rendering.
  at.create_requirement({
    spec_id: spec.id, label: 'FR2', class: 'non_functional',
    text: 'The thing is fast, and nobody has said how fast.', position: 1,
  });

  const epic = at.create_epic({ parent_id: spec.id, slug: 'sparse-epic', title: 'The sparse epic' });
  at.create_document_milestone({ document_id: epic.id, milestone_id: milestone.id });

  // `plan` and `description` unset on the story and its task.
  const story = at.create_story({ epic_id: epic.id, number: 1, title: 'Do it', position: 0 });
  const storyCriterion = at.create_story_criterion({
    story_id: story.id, text: 'It is done.', position: 0,
  });
  at.create_task({ story_id: story.id, number: 1, title: 'Do the first part', position: 0 });

  const matrix = at.create_coverage_matrix({
    parent_id: epic.id, slug: 'sparse-epic', title: 'Coverage: the sparse epic',
  });
  // `verified_at` unset — an unverified coverage row is the state a matrix spends most of its life
  // in, and it is the one no other fixture holds.
  const coverage = at.create_coverage({
    requirement_id: requirement.id,
    spec_fragment: 'The thing works.',
    story_criterion_id: storyCriterion.id,
    position: 0,
  });
  at.create_coverage_story({ coverage_id: coverage.id, story_id: story.id });

  const adr = at.create_adr({
    parent_id: spec.id, slug: 'sparse-decision', title: 'AD1: The sparse decision',
    decision: 'Take the simple option.',
  });
  // `chosen` and `rationale` unset. An option with no rationale is exactly the row whose template
  // branch went unexercised until a mutation found it in Epic 47-09.
  const option = at.create_adr_option({ adr_id: adr.id, name: 'The simple option', position: 0 });
  at.create_adr_option_tradeoff({
    option_id: option.id, axis: 'Cost', assessment: 'Low.',
  });

  const review = at.create_review({ slug: 'sparse-review', title: 'Review: the sparse spine' });
  const taxonomy = new Map(at.list_taxonomy({ limit: 200 }).items
    .map((term) => [`${term.domain}/${term.name}`, term.id]));
  const anyTerm = (domain) => [...taxonomy].find(([key]) => key.startsWith(`${domain}/`))?.[1];

  // `agent`, `status` and `remediation_task_id` unset.
  const finding = at.create_finding({
    review_id: review.id, position: 0,
    category_id: anyTerm('finding'), severity_id: anyTerm('severity'),
    summary: 'One thing to look at.',
  });

  const audit = at.create_audit({ slug: 'sparse-audit', title: 'Audit: the sparse spine' });
  // `line`, `symbol` and `recommendation` unset — an audit finding that names a file and nothing
  // finer, which is what a first pass produces.
  at.create_audit_finding({
    audit_id: audit.id, position: 0, dimension_id: anyTerm('audit_dimension'),
    file: 'src/thing.js', severity_id: anyTerm('severity'),
    summary: 'The file is long.',
  });

  const quick = at.create_quick({ slug: 'sparse-quick', title: 'Quick: the sparse fix' });
  // `met` and `note` unset — a criterion recorded before it is judged.
  at.create_quick_criterion({ quick_id: quick.id, text: 'The fix holds.', position: 0 });

  const retro = at.create_retro({
    parent_id: epic.id, slug: 'sparse-retro', title: 'Retro: the sparse epic',
  });
  // `synthesis`, `note` and `library_doc_id` unset, and `position` too — an observation captured
  // with nothing but its text.
  at.create_observation({ retro_id: retro.id, text: 'It went as expected.' });
  // `theme` and `note` unset.
  at.create_retro_application({
    retro_id: retro.id, applied_to_id: epic.id, disposition: 'applied',
  });

  const discussion = at.create_discussion({
    slug: 'sparse-discussion', title: 'Discussion: what to leave out',
  });
  at.create_document_agent({
    document_id: discussion.id, agent: at.list_agent({ limit: 1 }).items[0].name,
    document_kind: 'discussion',
  });

  // `source` unset — a library document written locally rather than imported.
  const library = at.create_library({
    slug: 'sparse-standards', title: 'Sparse standards', doc_type: 'reference',
  });
  at.create_library_scope({ document_id: library.id, scope: 'do' });

  // `description`, `retired_at` and `retired_reason` unset.
  const artifact = at.create_artifact({
    url: 'https://example.invalid/sparse', title: 'The sparse artifact', published_at: AT,
  });
  at.create_artifact_document({ artifact_id: artifact.id, document_id: spec.id });

  // **`create_dependency` is the one create tool with no bare call anywhere in this corpus, and it
  // cannot have one.** All four of its optional fields are its ends, and it refuses an edge with
  // none — "an edge needs one source and one target". Named here rather than left as a hole,
  // because the claim this corpus supports is that every create tool has a required-only call, and
  // an exception nobody wrote down is indistinguishable from one nobody noticed.
  at.create_dependency({ kind: 'blocks', source_document_id: epic.id, target_document_id: barren.epic.id });

  // --- Absence, part three: the vocabularies a project adds, and the joins onto them ------------

  // Project-added vocabulary rows, each with its optional column unset. These exist beside the
  // seeded ones so retirement is exercised on both — a term the project invented and a term the
  // release shipped retire through the same tool and must behave the same.
  const term = at.create_taxonomy({
    id: 'finding:sparse-gap', domain: 'finding', name: 'Sparse gap', position: 90,
  });
  at.create_agent({
    name: 'sparse', display_name: 'Sam', icon: '🧪', role: 'Tester',
    personality: 'Looks for what is missing.',
    communication_style: 'Short sentences, one question at a time.',
    position: 90,
  });
  at.create_test_approach({ tag: 'sparse', kind: 'level', position: 90 });
  // `gates_work` unset — a new edge kind that does not stop work until someone says it does.
  at.create_dependency_kind({ kind: 'sparse_relates', position: 90 });

  // **`create_observation` is the second tool with no bare call, for the same underlying reason as
  // `create_dependency`.** Its three parent columns are each individually optional — an observation
  // belongs to a retro *or* a story *or* a quick — but a `CHECK` requires at least one, and that is
  // a constraint `required` cannot express. A caller reading the input schema sees three optional
  // fields and nothing saying one of them is mandatory; the refusal only arrives at the write.
  // This one is parented onto a story, which is the parent no other observation here uses.
  const orphanObservation = at.create_observation({
    story_id: story.id, text: 'An observation hung off a story rather than a retro.',
  });
  at.create_observation_category({
    observation_id: orphanObservation.id, taxonomy_id: anyTerm('observation'),
  });

  // The approach joins, written *before* the retirement below so that retiring `unit` has rows
  // already pointing at it to preserve.
  const approach = at.list_test_approach({ limit: 1 }).items[0].tag;
  at.create_criterion_approach({ criterion_id: criterion.id, tag: approach });
  at.create_story_criterion_approach({ story_criterion_id: storyCriterion.id, tag: approach });

  // A session with nothing but its identifier — `skill`, `phase`, `state` and `superseded_by` are
  // all optional, which makes an empty session row a legal starting point.
  at.create_session({ id: 'session-sparse-bare' });

  // `phase` and `superseded_by` unset. `id` is caller-supplied on this one, which is why it is the
  // only create call here that names an identifier.
  const session = at.create_session({ id: 'session-sparse', skill: 'do', state: '{"step":1}' });

  // --- Endings: every terminal state the schema admits, reached through the tools ---------------

  // `document.status`, both terminal values beyond `complete`, plus `archived_at`. Each on its own
  // document, so a test can name which ending it is looking at.
  const superseded = at.create_spec({ slug: 'sparse-superseded', title: 'Superseded spec' });
  at.update_spec({ id: superseded.id, status: 'superseded' });

  const withdrawn = at.create_spec({ slug: 'sparse-withdrawn', title: 'Withdrawn spec' });
  at.update_spec({ id: withdrawn.id, status: 'withdrawn' });

  const archived = at.create_spec({ slug: 'sparse-archived', title: 'Archived spec' });
  at.update_spec({ id: archived.id, archived_at: AT });

  at.update_discussion({ id: discussion.id, status: 'complete' });

  // **`story.status` and `task.status` in full, not only their endings.** The claim the tests draw
  // from this corpus is over every value in every status vocabulary, because a state nothing ever
  // reaches is a state nothing has ever rendered — and `pending` arrives free on creation while the
  // other three each need a write.
  const storyStates = ['complete', 'superseded', 'withdrawn'].map((status, index) => {
    const ended = at.create_story({
      epic_id: epic.id, number: index + 2, title: `Story ${status}`, position: index + 1,
    });
    at.update_story({ id: ended.id, status });
    return ended;
  });
  const endedStory = storyStates.at(-1);

  const taskStates = ['complete', 'superseded', 'withdrawn'].map((status, index) => {
    const ended = at.create_task({
      story_id: endedStory.id, number: index + 1, title: `Task ${status}`, position: index,
    });
    at.update_task({ id: ended.id, status });
    return ended;
  });
  const endedTask = taskStates[1];

  // `adr.decision_status`, the three endings that are not `proposed`/`accepted`. None needs a
  // chosen option — the guard fires only on acceptance, which is what makes these reachable bare.
  const decisions = ['rejected', 'superseded', 'deprecated'].map((decision_status, index) => {
    const ended = at.create_adr({
      parent_id: spec.id, slug: `sparse-${decision_status}`,
      title: `AD${index + 2}: ${decision_status}`, decision: `It was ${decision_status}.`,
    });
    at.update_adr({ id: ended.id, decision_status });
    return ended;
  });

  // **A superseded ADR owes a `supersedes` edge, and the register said so.** The first cut of this
  // corpus set the status and stopped, on the assumption that an ending is a column — integrity
  // register entry 2 refused it. So the ending is a column and an edge together, and a corpus of
  // endings that wrote only the column would have been asserting a state the schema does not
  // consider reachable.
  //
  // The **superseded** ADR is the *source*, which is the opposite of what the kind's name suggests
  // and is stated nowhere but the register's own `WHERE` clause. Written this way round because
  // that clause is the authority; the first attempt pointed it the other way and was refused.
  at.create_dependency({
    kind: 'supersedes', source_document_id: decisions[1].id, target_document_id: adr.id,
  });

  // An `accepted` ADR, which is the one decision status that costs something to reach: the write
  // boundary requires exactly one chosen option, so this is the only ADR in the corpus that cannot
  // be bare. Kept anyway, because the state-space claim is over every value.
  const accepted = at.create_adr({
    parent_id: spec.id, slug: 'sparse-accepted', title: 'AD5: accepted',
    decision: 'It was accepted.',
  });
  at.create_adr_option({ adr_id: accepted.id, name: 'The chosen one', chosen: true, position: 0 });
  at.update_adr({ id: accepted.id, decision_status: 'accepted' });

  // `finding.status` in full. `open` is the column default, so the finding left alone reaches it
  // without a write — which is worth having in the corpus precisely because a default is the value
  // most likely to be assumed rather than checked.
  at.update_finding({ id: finding.id, status: 'rejected' });
  const findingStates = ['accepted', 'remediated'].map((status, index) => {
    const ended = at.create_finding({
      review_id: review.id, position: index + 1,
      category_id: anyTerm('finding'), severity_id: anyTerm('severity'),
      summary: `A finding that was ${status}.`,
    });
    at.update_finding({ id: ended.id, status });
    return ended;
  });
  const openFinding = at.create_finding({
    review_id: review.id, position: 3,
    category_id: anyTerm('finding'), severity_id: anyTerm('severity'),
    summary: 'A finding nobody has judged.',
  });

  // The remaining retirement columns, one each.
  const supersededSection = at.create_document_section({
    document_id: spec.id, heading: 'An old section', body: 'Replaced.', position: 1,
  });
  at.update_document_section({ id: supersededSection.id, superseded_at: AT });

  at.update_quick({ id: quick.id, closed_at: AT });

  const retiredArtifact = at.create_artifact({
    url: 'https://example.invalid/gone', title: 'The retired artifact', published_at: AT,
  });
  at.update_artifact({
    id: retiredArtifact.id, retired_at: AT, retired_reason: 'The dashboard it pointed at is gone.',
  });

  // A criterion an amendment overtook. **On a criterion of its own, and it has to be.** The one
  // created above carries the live coverage binding and the approach join, so superseding it would
  // put the corpus's only matrix row behind a mark and take the unverified-cell branch with it.
  const supersededCriterion = at.create_story_criterion({
    story_id: story.id, text: 'It is done the old way.', position: 1,
  });

  at.update_story_criterion({
    id: supersededCriterion.id,
    superseded_at: AT,
    superseded_reason: 'The requirement it read stopped asking for the old way.',
  });

  // A withdrawn binding, on the same requirement as the live one. **The live row above must stay
  // live**, because the branch this corpus is built to reach is a matrix cell with no ✓ — so the
  // ending gets a binding of its own rather than being applied to the one already here.
  const retiredCoverage = at.create_coverage({
    requirement_id: requirement.id,
    spec_fragment: 'The thing works',
    story_criterion_id: storyCriterion.id,
    position: 1,
  });

  at.retire_coverage({
    id: retiredCoverage.id, reason: 'The fragment dropped the full stop and half the obligation.',
  });

  // **`position` is set here and omitted on the bare observation above, and it has to be.**
  // `create_observation` is the only create tool that declares `position` optional, and omitting it
  // defaults to a fixed value rather than allocating the next one — so a second observation on the
  // same retro collides on `UNIQUE (retro_id, position)`. One call per tool omitting everything
  // optional is what the corpus claims; every call doing so is not reachable, and this is why.
  const retiredObservation = at.create_observation({
    retro_id: retro.id, position: 1, text: 'A lesson that stopped being true.',
  });
  at.update_observation({
    id: retiredObservation.id, retired_at: AT, retired_reason: 'The module it warned about is gone.',
  });

  // **The predecessor carries the pointer**, so the superseding session has to exist first and the
  // older one names it on creation — `update_session` does not expose `superseded_by`, which makes
  // the direction of this edge a property of the write surface rather than a convention.
  const supersededSession = at.create_session({
    id: 'session-sparse-old', skill: 'do', state: '{"step":0}', superseded_by: session.id,
  });

  // --- Endings: the four vocabulary retirements, applied after rows reference them --------------

  // **The order is the point.** Retiring a term must keep the rows already pointing at it readable
  // and rendering, while refusing new ones (integrity register entry 10). Retiring first and never
  // referencing would satisfy the first half by having nothing to preserve.
  const retiredTerms = {
    taxonomy: anyTerm('finding'),
    agent: at.list_agent({ limit: 1 }).items[0].name,
    test_approach: at.list_test_approach({ limit: 1 }).items[0].tag,
    dependency_kind: 'supersedes',
  };

  at.retire_taxonomy({ id: retiredTerms.taxonomy });
  at.retire_agent({ name: retiredTerms.agent });
  at.retire_test_approach({ tag: retiredTerms.test_approach });
  at.retire_dependency_kind({ kind: retiredTerms.dependency_kind });

  return {
    calls,
    barren,
    spec,
    epic,
    story,
    matrix,
    adr,
    option,
    review,
    finding,
    audit,
    quick,
    retro,
    discussion,
    library,
    artifact,
    session,
    requirement,
    criterion,
    coverage,
    milestone,
    term,
    orphanObservation,
    endings: {
      documents: { superseded, withdrawn, archived },
      story: endedStory,
      task: endedTask,
      decisions,
      accepted,
      stories: storyStates,
      tasks: taskStates,
      findings: { rejected: finding, judged: findingStates, open: openFinding },
      section: supersededSection,
      artifact: retiredArtifact,
      coverage: retiredCoverage,
      criterion: supersededCriterion,
      observation: retiredObservation,
      session: supersededSession,
    },
    retiredTerms,
  };
}
