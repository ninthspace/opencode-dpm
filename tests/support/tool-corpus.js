/**
 * One row in every table that has a create tool, written **only** through those tools.
 *
 * `corpus.js` is the other whole-corpus fixture and it is not this one. It was written for Epic
 * 47-04, when the create tools covered the spine and nothing else, so it writes eleven kinds and
 * nine child tables by `INSERT` — which is honest for what it was checking (the *renderer*, given
 * rows) and is the wrong instrument for what Story 6 checks. FR10's two halves are "every table
 * has a create tool" (Story 1) and "every kind has a template" (Epic 47-04 Story 2), and a fixture
 * that writes rows by statement satisfies the second while saying nothing about the first. The
 * closure needs one corpus that passed through both, which is why this file exists beside the
 * other rather than replacing it.
 *
 * **Every value that has to be found again is a nonsense word.** A template that dropped a
 * collection would still leave `Context`, `must`, `open` and every other structural word in the
 * output, so a witness drawn from the vocabulary of the format proves nothing about the row. The
 * witnesses here are minerals, one per table, held nowhere else in the schema or the seeds.
 */

/** The one witness word per table, so a test can name the table a missing string belongs to. */
export const WITNESS = {
  document: 'kimberlite',
  document_section: 'peridotite',
  library_document: 'coding-standards',
  library_scope: 'do',
  adr: 'eclogite',
  adr_option: 'gabbro',
  adr_option_tradeoff: 'komatiite',
  review: 'story',
  document_agent: 'Architect',
  quick: 'basalt',
  quick_criterion: 'rhyolite',
  requirement: 'andesite',
  story: 'dacite',
  task: 'obsidian',
  acceptance_criterion: 'pumice',
  criterion_approach: 'unit',
  story_criterion: 'scoria',
  story_criterion_approach: 'integration',
  // **These two are rendered table cells rather than words, and they have to be.** A coverage row
  // is made entirely of other tables' values — `spec_fragment` is a *substring of the requirement's
  // own text*, which integrity register entry 9 requires — so any word it holds is already in the
  // spec file whether or not the matrix rendered anything at all. The pipe-delimited cell is the
  // only string the matrix produces and nothing else does. Same for the join: `coverage_story`
  // renders as `Story 1` in the *Covered by* column, and the story's title would have been found
  // in the epic file with the matrix empty.
  coverage: '| FR1 | its own tool: andesite, and tephra |',
  coverage_story: '| Story 1 | `[integration]` |',
  milestone: 'ignimbrite',
  document_milestone: 'ignimbrite',
  finding: 'trachyte',
  observation: 'phonolite',
  observation_category: 'Latite',
  audit_finding: 'syenite',
  retro_application: 'monzonite',
  artifact: 'diorite',
  artifact_document: 'diorite',
  taxonomy: 'Latite',
  agent: 'Charnockite',
  test_approach: 'tonalite',
  // Not a word but a rendered line: Story 2 is held back by an edge of a **project-added** kind,
  // so this string appears only if the template read `gates_work` off the vocabulary instead of
  // matching the name `blocks`. Story 1's own field renders `—`, so the line is unambiguous.
  dependency_kind: '**Blocked by**: Story 1',
  dependency: 'norite',
};

/**
 * Build the corpus.
 *
 * @param {Record<string, Function>} call The tool surface, by name.
 * @returns {Record<string, {id?: string}>} The rows other tests need to reach by id.
 */
export function toolCorpus(call) {
  // --- The vocabularies, added before anything references them --------------------------------
  //
  // FR24's own claim is that a project-added term is usable with no schema change, and the way to
  // assert that is to use one: every reference below that *can* name an added term does, so a
  // vocabulary that were somehow special-cased to its seeds would fail here rather than in a test
  // written specially for it.
  const category = call.create_taxonomy({
    id: 'observation:latite', domain: 'observation', name: 'Latite',
    singular: 'Latite observation', position: 90,
  });

  call.create_agent({
    name: 'charnockite', display_name: 'Charnockite', icon: '🪨', role: 'Petrologist',
    personality: 'Patient', communication_style: 'Measured', position: 90,
  });

  call.create_test_approach({ tag: 'tonalite', kind: 'level', position: 90 });
  call.create_dependency_kind({ kind: 'norite', gates_work: true, position: 90 });

  // --- The spec, and everything hanging off it ------------------------------------------------
  const spec = call.create_spec({ slug: 'kimberlite', title: 'The kimberlite spec' });

  call.create_document_section({
    document_id: spec.id, heading: 'Context', position: 0,
    body: 'A body only this section holds: peridotite.',
  });

  // The text carries the coverage fragment as a literal substring: integrity register entry 9
  // requires it, and a fixture that ignored that would build a database the restorer refuses —
  // which is the check working, and was found by it.
  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR1', class: 'functional', moscow: 'must', position: 0,
    text: 'Every table is reachable through its own tool: andesite, and tephra.',
  });

  const criterion = call.create_acceptance_criterion({
    requirement_id: requirement.id, polarity: 'must', position: 0,
    text: 'A row round-trips: pumice.',
  });

  // Two tags on one criterion, and one of them is the added one: `criterion_approach`'s witness is
  // the seeded tag and `test_approach`'s is the added tag, so dropping the join loses both and
  // failing to read the vocabulary loses only the second. One witness for the pair could not.
  call.create_criterion_approach({ criterion_id: criterion.id, tag: 'unit' });
  call.create_criterion_approach({ criterion_id: criterion.id, tag: 'tonalite' });

  const milestone = call.create_milestone({
    spec_id: spec.id, label: 'M1', title: 'The ignimbrite milestone',
    summary: 'Substrate and tools', position: 0,
  });

  // --- The epic, its stories, and the delivery rows -------------------------------------------
  const epic = call.create_epic({
    parent_id: spec.id, slug: 'parity', title: 'Parity and search',
  });

  call.create_document_milestone({ document_id: epic.id, milestone_id: milestone.id });

  const story = call.create_story({
    epic_id: epic.id, number: 1, title: 'Write the dacite story', position: 0,
  });
  const second = call.create_story({
    epic_id: epic.id, number: 2, title: 'And the one it waits on', position: 1,
  });

  call.create_task({
    story_id: story.id, number: 1, title: 'Cut the obsidian', position: 0,
    description: 'One task, so the collection is not empty.',
  });

  const storyCriterion = call.create_story_criterion({
    story_id: story.id, polarity: 'must', position: 0,
    text: 'Each table renders: scoria.',
  });

  call.create_story_criterion_approach({
    story_criterion_id: storyCriterion.id, tag: 'integration',
  });

  // Two edges of the **added** kind, and they are witnessed differently on purpose. The
  // document-level edge renders its kind by name, which shows the row reached the page. The
  // story-level one renders only its target, under `**Blocked by**` — and it renders there at all
  // only if the template asked `dependency_kind.gates_work` rather than matching the name
  // `blocks`, which is what FR24's extensibility means for a template and what this pair asserts.
  call.create_dependency({
    kind: 'norite', source_story_id: second.id, target_story_id: story.id,
  });
  call.create_dependency({
    kind: 'norite', source_document_id: epic.id, target_document_id: spec.id,
  });

  // --- The matrix, and the binding that gives it a row ----------------------------------------
  const matrix = call.create_coverage_matrix({
    parent_id: epic.id, slug: 'parity', title: 'Coverage: parity and search',
  });

  const coverage = call.create_coverage({
    requirement_id: requirement.id, story_criterion_id: storyCriterion.id, position: 0,
    spec_fragment: 'its own tool: andesite, and tephra',
  });

  call.create_coverage_story({ coverage_id: coverage.id, story_id: story.id });

  // --- The ADR, which renders inside its parent rather than into a file of its own -------------
  const adr = call.create_adr({
    parent_id: spec.id, slug: 'one-way', title: 'The projection is one-way',
    decision: 'Markdown is written and never read: eclogite.',
  });

  const option = call.create_adr_option({
    adr_id: adr.id, name: 'The gabbro option', chosen: true, position: 0,
    rationale: 'Chosen because it is the simpler of the two.',
  });

  call.create_adr_option_tradeoff({
    option_id: option.id, axis: 'cost', assessment: 'low, and komatiite',
  });

  // Accepted last, because an accepted ADR has exactly one chosen option and the guard on
  // `DETAIL.adr` counts them at the moment the status is written.
  call.update_adr({ id: adr.id, decision_status: 'accepted' });

  // --- The review, its agent and its finding ---------------------------------------------------
  const review = call.create_review({
    parent_id: epic.id, slug: 'parity', title: 'Review: parity and search',
    scope: 'story', scope_story_id: story.id,
  });

  // The seeded persona and the added one, for the same reason the criterion carries two tags.
  call.create_document_agent({
    document_id: review.id, document_kind: 'review', agent: 'architect',
  });
  call.create_document_agent({
    document_id: review.id, document_kind: 'review', agent: 'charnockite',
  });

  call.create_finding({
    review_id: review.id, position: 0, agent: 'architect',
    category_id: 'finding:hidden-complexity', severity_id: 'severity:critical',
    summary: 'A finding only this review holds: trachyte.',
  });

  // --- The retro, its observation, that observation's added category, and an application -------
  const retro = call.create_retro({
    parent_id: epic.id, slug: 'parity', title: 'Retro: parity and search',
  });

  const observation = call.create_observation({
    retro_id: retro.id, story_id: story.id, position: 0,
    text: 'An observation only this retro holds: phonolite.',
    note: 'Held structurally.',
  });

  call.create_observation_category({
    observation_id: observation.id, taxonomy_id: category.id,
  });

  call.create_retro_application({
    retro_id: retro.id, applied_to_id: epic.id, disposition: 'applied',
    theme: 'The monzonite theme', note: 'Carried into the next epic.',
  });

  // --- The audit and its finding ---------------------------------------------------------------
  const audit = call.create_audit({ slug: 'render', title: 'Audit: the render path' });

  call.create_audit_finding({
    audit_id: audit.id, position: 0, dimension_id: 'audit_dimension:test-debt',
    file: 'src/projection/syenite.js', line: 100, symbol: 'table',
    severity_id: 'severity:suggestion',
    summary: 'The table helper has no test for a row shorter than its header.',
    recommendation: 'Add the short-row case beside the existing width test.',
  });

  // --- The quick, and its criteria -------------------------------------------------------------
  const quick = call.create_quick({
    slug: 'basalt', title: 'The basalt quick', closed_at: '2026-01-01T00:00:00Z',
  });

  call.create_quick_criterion({
    quick_id: quick.id, text: 'A cell renders whole: rhyolite.', met: true, position: 0,
  });

  // --- The library document, and the scopes it is loaded under ---------------------------------
  const library = call.create_library({
    slug: 'standards', title: 'Coding standards', doc_type: 'coding-standards',
  });

  call.create_library_scope({ document_id: library.id, scope: 'do' });
  call.create_document_section({
    document_id: library.id, heading: 'Rules', position: 0,
    body: 'Edit file-by-file. Also: peridotite.',
  });

  // --- The artifact, and the document it belongs to ---------------------------------------------
  const artifact = call.create_artifact({
    url: 'https://example.invalid/diorite', title: 'The diorite artifact',
    description: 'A walk through the render path', published_at: '2026-01-01T00:00:00Z',
  });

  call.create_artifact_document({ artifact_id: artifact.id, document_id: spec.id });

  // --- The four remaining kinds, each of which renders as prose ---------------------------------
  const prose = {};

  for (const [kind, slug] of [
    ['problem_brief', 'kimberlite'], ['product_brief', 'kimberlite'],
    ['discussion', 'kimberlite'], ['runbook', 'kimberlite'],
  ]) {
    prose[kind] = call[`create_${kind}`]({ slug, title: `The kimberlite ${kind}` });
    call.create_document_section({
      document_id: prose[kind].id, heading: 'Body', position: 0,
      body: 'Prose that renders: peridotite.',
    });
  }

  // --- The one table with a create tool and no projection ---------------------------------------
  //
  // Written so the absence below is an absence *of a rendering*, not of a row. A test that checked
  // `session` never appears would pass against a fixture that never wrote one.
  call.create_session({
    id: 'session-kimberlite', skill: 'cpm:do', phase: 'story-2', state: '{"story":2}',
  });

  return {
    spec, epic, story, second, matrix, adr, review, retro, audit, quick, library, artifact,
    requirement, criterion, storyCriterion, coverage, milestone, observation, option, category,
    ...prose,
  };
}
