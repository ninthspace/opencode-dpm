/**
 * Reading a dpm SKILL.md, and binding a test to it in both directions.
 *
 * Twenty-two skills are converted the same way, so what a conversion test needs is here once
 * rather than twenty-two times. The part worth stating is the binding, because it is what stops
 * a conversion test from quietly becoming a test of the tools:
 *
 * - **Every tool name the file mentions resolves to a real tool.** Without this a skill can
 *   instruct a run to call something that does not exist, and every behavioural test still
 *   passes, because the test calls the tools it knows about rather than the ones the file names.
 * - **Every tool the test drove is named in the file.** Without this the test drifts: it keeps
 *   passing while the file it claims to exercise loses the call the assertion depends on.
 *
 * Neither direction needs a manifest, and deliberately so. A hand-kept list of "the tools this
 * skill uses" is a third place the truth lives, and it is the one nothing fails on when it goes
 * stale.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS = join(import.meta.dirname, '..', '..', 'skills');

/**
 * @param {string} name The skill's directory name, which is also its `name:` in the front matter.
 * @returns {string}
 */
export function skillSource(name) {
  return readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
}

/** The shared conventions, which a skill reaches by naming the file and reading it at startup. */
export function conventions() {
  return readFileSync(join(SKILLS, '..', 'shared', 'skill-conventions.md'), 'utf8');
}

/**
 * Every skill in the plugin, by directory name — **read from the tree, never listed**.
 *
 * The per-epic corpora are named lists because each epic's scope genuinely is its own handful of
 * conversions. A claim about *the corpus* is the opposite: a skill added after the check was
 * written is precisely the one nobody thought about, and a named list is how it goes unchecked
 * while the suite reports the property holding everywhere.
 *
 * @returns {string[]}
 */
export function skillNames() {
  return readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * A skill's source together with **only the shared procedures it names** — what a run following
 * this file actually has in front of it, which is what both binding directions are about.
 *
 * **The whole-file union is the wrong mechanism and was tried first.** Splicing the conventions in
 * whenever a skill mentions the path makes every skill "name" every tool any procedure uses: a file
 * could delete its Library Check reference outright and `list_library` would still resolve, because
 * the resolution came from a document that mentions everything. That is a guard that passes because
 * it can no longer see its subject — the failure `prose` exists to prevent, one level up.
 *
 * Delegation is per procedure, so resolution is per procedure. `Follow the shared **Library Check**
 * procedure` splices that section and nothing else; drop the sentence and the tools go with it.
 *
 * @param {string} source
 * @returns {string}
 */
export function reachable(source) {
  const shared = conventions();
  const cited = [...source.matchAll(/shared \*\*([^*]+)\*\*/g)].map((hit) => hit[1].trim());

  return [source, ...new Set(cited)].map((part, index) => (index === 0 ? part : section(shared, part)))
    .join('\n');
}

/**
 * The front matter as key/value pairs. Deliberately shallow — the fields a skill declares are
 * flat strings, and a parser richer than the format invites assertions the format cannot carry.
 *
 * @param {string} source
 * @returns {Record<string, string>}
 */
export function frontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};

  return Object.fromEntries(match[1].split('\n')
    .map((line) => line.match(/^([a-z_]+):\s*(.*)$/))
    .filter(Boolean)
    .map((field) => [field[1], field[2].trim()]));
}

/**
 * The prefix the harness supplies, **derived from the plugin manifest rather than written down**.
 *
 * A plugin-bundled server's tools are dispatched as `mcp__plugin_<plugin>_<server>__<tool>`, so a
 * skill writes `mcp__plugin_dpm_dpm__create_spec` while the registry holds `create_spec` (FR29).
 * The two `dpm` parts are the plugin name and the server key, not one name said twice.
 *
 * **It is computed because the transcribed version was wrong for the whole of M4.** A constant
 * spelling out a prefix is a second copy of what the manifest already states, and nothing in this
 * repository can contradict it: every test here spawns the server itself, so none of them ever
 * meets the name the harness builds. Reading the manifest is the closest a test in this suite can
 * get to the thing that does the naming.
 *
 * The substitution follows the documented rule — any character outside `A-Z`, `a-z`, `0-9`, `_`
 * and `-` becomes `_` — rather than assuming dpm's own names need none, so a rename to something
 * with a dot or a space in it produces the prefix the harness would.
 */
export const CALLABLE = (() => {
  const manifest = JSON.parse(
    readFileSync(join(SKILLS, '..', '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  const keys = Object.keys(manifest.mcpServers ?? {});

  if (keys.length !== 1) {
    throw new Error(`expected exactly one declared server, found ${keys.length}`);
  }

  const safe = (part) => part.replaceAll(/[^A-Za-z0-9_-]/g, '_');

  return `mcp__plugin_${safe(manifest.name)}_${safe(keys[0])}__`;
})();

/**
 * Every distinct tool the file names, given as **exported** names so they compare directly against
 * the registry.
 *
 * **The match is on the callable form deliberately.** A skill that wrote a bare `create_spec` would
 * be naming something no agent can call, and matching it here would launder that into a passing
 * binding. Contributing nothing instead is what makes the second direction below fail on it.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function toolNames(source) {
  const found = [...source.matchAll(new RegExp(`${CALLABLE}([a-z_]+)`, 'g'))].map((hit) => hit[1]);

  return [...new Set(found)].sort();
}

/**
 * The body under a heading, up to the next heading at the same level or above.
 *
 * Sections are how a skill's steps are addressed — "Step 6b", "Section 5" — so a check on a
 * retained behaviour can be scoped to the step that owns it rather than run over the whole file.
 * A rule found anywhere in a four-hundred-line file is a weaker claim than the same rule found
 * in the step that has to apply it.
 *
 * @param {string} source
 * @param {string} heading Matched as a substring of the heading line, so "Step 6b" finds it.
 * @returns {string} The section body, or an empty string when no heading matches.
 */
export function section(source, heading) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^#{2,6} /.test(line) && line.includes(heading));
  if (start === -1) return '';

  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const hashes = line.match(/^(#{1,6}) /);
    return hashes && hashes[1].length <= level;
  });

  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * The same body with its whitespace collapsed, for matching a **phrase** rather than a shape.
 *
 * SKILL.md files are hard-wrapped, so a sentence sits on one line today and across two the moment
 * a word above it changes. An assertion written against the current wrapping then fails on an edit
 * that did not touch it — and, worse, one written *with* a wrap in it silently stops constraining
 * anything if the wrap moves, which is a guard that passes because it can no longer see its
 * subject. Collapsing first makes the assertion about the words.
 *
 * **`section` still returns the raw body, deliberately.** A check on structure — that a step
 * composes no markdown table, that a heading precedes another — reads the line breaks, and
 * collapsing them would make `/\|\s*-{3}/` match prose that merely contains a pipe.
 *
 * @param {string} source
 * @param {string} heading
 * @returns {string}
 */
export function prose(source, heading) {
  return section(source, heading).replace(/\s+/g, ' ').trim();
}

/**
 * The instruction lines of a section — its numbered steps and their continuations — apart from the
 * prose that justifies them.
 *
 * **Three stories running lost a mutation to the gap between the two.** A rule in a converted skill
 * is written twice: once as the numbered step a run follows, and once as the paragraph beneath
 * saying why. A mutation reaches one without the other — Story 7's rewrote `quick`'s close step to
 * open a retro for its observation while the paragraph below went on forbidding exactly that, and
 * every assertion passed, because the test supplies `quick_id` whatever the step says. A
 * section-wide match cannot tell the two apart: it finds the rule in the paragraph and reports the
 * step as intact.
 *
 * So the rule is asserted here and its rationale asserted against `prose`. **The paragraph is why
 * the rule is kept; the step is the rule**, and only one of them is what a run does.
 *
 * @param {string} source
 * @param {string} heading Passed through to `section`.
 * @returns {string} The numbered lines joined by spaces, so a phrase spanning a wrap still matches.
 */
export function instructions(source, heading) {
  return section(source, heading)
    .split('\n')
    .filter((line) => /^\d+\. |^ {3}/.test(line))
    .join(' ');
}

/** A block puts something to the user for a decision rather than simply executing it. */
const PROPOSES = /\bpropose\b|\bdraft\b|\bfacilitate\b|\bsuggest\b|work through|\belicit\b|\bagree\b|present (?:each|the|a|it|them)/i;

/**
 * A block names the mechanism that holds the turn open.
 *
 * **`AskUserQuestion` and nothing looser.** Matching the bare word *gate* was tried and is worse
 * than no check: it is satisfied by a sentence *about* gating, so a block can lose its actual gate
 * while a neighbouring clause explaining the gating rule keeps it passing. And soft prose — "present
 * and refine", "confirm before writing" — is the shape the defect takes, so accepting it as
 * evidence of a gate accepts the thing being checked for.
 */
const GATES = /AskUserQuestion/;

/** Startup and bookkeeping blocks, which write and are never a proposal to approve. */
const BOOKKEEPING = /^(Session|Roster|Library|Retro awareness|Prior decisions|Constraint inheritance|Test runner|Commands|Resolving it|Codebase grounding)$/;

/**
 * Every `##`–`####` heading block in a skill file, with its depth and body.
 *
 * @param {string} source
 * @returns {{heading: string, depth: number, body: string}[]}
 */
export function blocks(source) {
  const found = [];
  let current = null;

  for (const line of source.split('\n')) {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      current = { heading: heading[2], depth: heading[1].length, body: [] };
      found.push(current);
    } else if (current) current.body.push(line);
  }

  return found.map((block) => ({ ...block, body: block.body.join('\n') }));
}

/**
 * The blocks that put something to the user, write rows, and are reached by no gate.
 *
 * A skill that renders a proposal and ends the turn has asked nothing and, where the rows are
 * already written, recorded the answer on the user's behalf. Coverage is read off the file in three
 * clauses rather than from a list of blocks judged once:
 *
 * 1. the block **gates itself** — it names `AskUserQuestion`;
 * 2. a `###`-or-shallower block is reached by a **blanket rule in the skill's `## Process`
 *    preamble**, which is where a skill states that every section, step or phase gates;
 * 3. a `####` block is reached by no blanket rule, because a rule written about sections, steps or
 *    phases does not say whether a sub-block of one is itself a unit — and a run resolving that
 *    ambiguity by writing first is the failure this exists to catch.
 *
 * **Keyed on what the block does, never on which blocks are named.** A rule listing the steps that
 * must gate would be a copy of the file rather than a check on it, and the block added next year is
 * exactly the one no list contains.
 *
 * @param {string} source
 * @returns {{heading: string, depth: number}[]}
 */
export function ungated(source) {
  const preamble = (source.split(/^## Process\s*$/m)[1] ?? '').split(/^### /m)[0];
  const blanket = GATES.test(preamble);

  return blocks(source)
    .filter(({ heading, body }) => !BOOKKEEPING.test(heading)
      && new RegExp(`${CALLABLE}(create|update)_`).test(body)
      && PROPOSES.test(body)
      && !GATES.test(body))
    .filter(({ depth }) => !(depth <= 3 && blanket))
    .map(({ heading, depth }) => ({ heading, depth }));
}

/**
 * A dispatcher that records which tools were called and which arguments each call carried, so a
 * run can be checked against the file that prescribed it.
 *
 * **The arguments are recorded because the tool names alone do not catch the failure FR4 is
 * about.** A skill that called `create_requirement` and never mentioned `class` would pass a
 * name-level binding in both directions while leaving the one column the requirement exists to
 * protect unspecified — and the run would keep working, because the test knows to pass it.
 *
 * @param {object[]} tools
 * @returns {{call: Record<string, Function>, used: Set<string>, passed: Map<string, Set<string>>}}
 */
export function recorder(tools) {
  const used = new Set();
  const passed = new Map();

  const call = Object.fromEntries(tools.map((tool) => [
    tool.name,
    (args) => {
      used.add(tool.name);
      const keys = passed.get(tool.name) ?? new Set();
      for (const key of Object.keys(args ?? {})) keys.add(key);
      passed.set(tool.name, keys);

      return tool.handler(args);
    },
  ]));

  return { call, used, passed };
}

/**
 * The patterns that mean a skill recovers an entity by reading what was written rather than by
 * calling a tool — FR25's per-file must-NOT, which every conversion asserts against its own file.
 *
 * **Shared because it is the same clause, not because two tests happened to want the same list.**
 * What each skill would wrongly read back differs — `spec` a requirement list, `epics` a coverage
 * matrix, `do` a blocking field — but the *shape* of the mistake does not, and a per-file copy is
 * twenty-two places for one of these to be quietly dropped. A skill needing an exception passes it
 * as `allow` rather than keeping a shorter list of its own.
 *
 * **A markdown table divider is deliberately absent.** The obvious check fires on a table a skill
 * *shows the user* while facilitating, which is neither generated nor read back; a check that
 * cannot tell those apart fails a correct file and is silenced by deleting a facilitation aid.
 * Where a particular step must compose no table, scope the check to that step.
 */
export const RECOVERY = [
  { pattern: /docs\//, why: 'a path into the rendered tree — the projection owns those' },
  { pattern: /\bglob\b/i, why: 'a glob, which is how every recovery this conversion removes began' },
  { pattern: /\*\.md\b|\[0-9\]\*/, why: 'a filename pattern' },
  { pattern: /\{nn\}|\{seq\}|\{parent\}|\{slug\}|\{session_id\}/, why: 'a filename template' },
  { pattern: /-coverage-/, why: 'a companion coverage file, which is a projection and not a write' },
  { pattern: /front\s*matter/i, why: 'a front-matter read, which is a parse of a generated file' },
  { pattern: /\bRead tool\b|\bGrep tool\b|\bGlob tool\b/, why: 'a file-reading tool' },
  {
    pattern: /\*\*Status\*\*:|\*\*Blocked by\*\*:|\*\*Source\*\*:|\*\*Satisfies\*\*/,
    why: 'a metadata field parsed out of prose',
  },
  { pattern: /progress file/i, why: 'a progress-file lifecycle — session state is a row' },
];

/**
 * A document id standing where a person is meant to read or type something — FR5 and FR6.
 *
 * **The placeholder is the shape, because it is the one a skill's output actually carries.** A
 * skill file holds no real ULID to find; what it holds is `{epic id}` inside a command it tells a
 * person to run, and the id only becomes visible when the run substitutes one. So the reading is
 * over the brace form, and it is deliberately not a reading for ULIDs: a check for the literal
 * matches nothing in this corpus and passes over every leak in it.
 *
 * **`{{ref:<id>}}` is the correct form and is exempted by shape rather than by name.** Its inner
 * `<id>` sits inside a marker the renderer resolves, which is the opposite of interpolating an id
 * into prose, and the double brace is what tells the two apart without a list of allowed strings.
 *
 * The reading says nothing about a skill's *argument contract* — `$ARGUMENTS names a document id`
 * is a sentence about what a tool call receives, not one a person is asked to type a ULID into, and
 * widening this to catch it would report nine skills for describing their own input correctly.
 * Making that input accept a reference as well is a separate story with its own criteria.
 */
export const NAMED_BY_ID = [
  {
    pattern: /(?<!\{)\{[^{}]*\bid\b[^{}]*\}(?!\})/,
    why: 'a document id interpolated where a person reads or types — a reference belongs there',
  },
];

/**
 * FR3's clause: a statement, never a keyword list — and two readings, because the keywords divide
 * into two kinds.
 *
 * **The ambiguous ones are matched case-sensitively.** `SELECT … FROM` cannot be required as a
 * shape, because English produces it: *"Select the few most relevant rather than everything from
 * the newest retro"* is a sentence in `spec` and matches every structural pattern one can write.
 * What it does not do is capitalise both words, and SQL written into a document conventionally
 * does. That is the discriminator, and it is worth stating that it is a convention rather than a
 * guarantee: a lowercase `select … from` would pass this sweep. The alternative — a
 * case-insensitive sweep — reported that same correct sentence as a violation, which is the failure
 * mode that gets a check narrowed until it finds nothing.
 *
 * **The unambiguous ones are matched either way**, because no English sentence contains `INSERT
 * INTO`, `DELETE FROM`, `PRAGMA foreign_keys` or `sqlite3` by accident.
 *
 * Shared for `RECOVERY`'s reason: FR3 is one clause against twenty-two files, converted across
 * three epics, and a per-corpus copy is three places for a pattern to be quietly dropped. The
 * *controls* stay with each corpus test, because a sweep's credibility comes from being run against
 * prose that must not match — and the prose that must not match is that corpus's own.
 */
export const SQL = [
  { pattern: /\bSELECT\b[\s\S]{0,120}?\bFROM\b/, why: 'a SELECT … FROM' },
  { pattern: /\bJOIN\s+[a-z_]+\s+ON\b/, why: 'a JOIN … ON' },
  { pattern: /\bWHERE\b[\s\S]{0,80}?[=<>]/, why: 'a WHERE clause' },
  { pattern: /\bINSERT\s+INTO\b/i, why: 'an INSERT INTO' },
  { pattern: /\bUPDATE\s+[a-z_]+\s+SET\b/i, why: 'an UPDATE … SET' },
  { pattern: /\bDELETE\s+FROM\b/i, why: 'a DELETE FROM' },
  { pattern: /\bCREATE\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i, why: 'a CREATE statement' },
  { pattern: /\bPRAGMA\s+[a-z_]+/i, why: 'a PRAGMA' },
  { pattern: /\bsqlite3?\b/i, why: 'a sqlite invocation' },
];

/**
 * The constructions FR25 names, on top of the recovery sweep every conversion already runs.
 *
 * `RECOVERY` catches a skill *reading* what was written; this catches one *allocating* what to
 * write it as. They are the two halves of the same subtraction and neither implies the other — a
 * file can name no path at all and still keep a counter.
 */
export const CONSTRUCTIONS = [
  { pattern: /\bnext (available )?number\b|\bhighest (existing )?number\b/i, why: 'a number-allocation procedure' },
  { pattern: /\bincrement\b/i, why: 'a counter the skill keeps' },
  { pattern: /\bzero-pad|\bpad(ded)? to two\b/i, why: 'a number formatted for a filename' },
];

/**
 * Which of those a skill's source trips, as sentences naming the line.
 *
 * A function returning problems rather than a run of assertions, so the same reading can be driven
 * against sources that are wrong on purpose — the shape `reachability.test.js` uses for the same
 * reason.
 *
 * The one path a skill may name is its own shared conventions: it is not a generated artefact and
 * is not recovered from, it is read once for prose.
 *
 * @param {string} source
 * @param {{pattern: RegExp, why: string}[]} [extra] Further patterns for this skill alone.
 * @returns {string[]}
 */
export function recoveries(source, extra = []) {
  return sweep(source.replace(/`dpm\/shared\/skill-conventions\.md`/g, ''), [...RECOVERY, ...extra])
    .map((problem) => `names ${problem}`);
}

/**
 * Which of a list of patterns a source trips, each as a sentence naming the line it sits on.
 *
 * The reading `recoveries` is built from, exported because Story 4's corpus checks need the same
 * one over different pattern sets — FR3's SQL statements and FR25's named constructions. Naming
 * the line rather than the offset is the whole point: a sweep that reports "3 problems" sends the
 * reader looking, and a sweep that quotes the sentence is either obviously right or obviously a
 * false positive.
 *
 * @param {string} source
 * @param {{pattern: RegExp, why: string}[]} patterns
 * @returns {string[]}
 */
export function sweep(source, patterns) {
  return patterns.flatMap(({ pattern, why }) => {
    const hit = source.match(pattern);

    return hit ? [`${why} — ${JSON.stringify(line(source, hit.index))}`] : [];
  });
}

/** The line a match sits on, so a failure names the sentence rather than an offset. */
function line(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);

  return text.slice(start, end === -1 ? undefined : end).trim();
}

/**
 * The project every skill starts in, and the startup every skill runs — the two halves of the
 * same duplication, held here now that three conversions have written both and nineteen more
 * will.
 *
 * **What makes them shareable is that they are not per-skill.** A scoped library document, a
 * retro with a live observation and a retired one, and a session to adopt are what *any* dpm
 * skill finds on a real project; the four startup blocks that read them are the same four blocks
 * in every converted file, differing only in the scope keyword and the skill name. Where a skill
 * genuinely reads more — `spec`'s prior decisions, `do`'s test approaches — it drives that itself
 * after calling this.
 *
 * **The observation's category is resolved here rather than left to the caller.** Every skill's
 * retro-awareness block selects by category, so a helper that returned uncategorised rows would
 * let each conversion decide separately whether the category was worth fetching — and the one
 * that decided it was not would still describe selecting by it.
 */

/**
 * Seed it. Uses raw handlers via `seed`, never the recorder: a fixture write counted as a run
 * write demands the skill name a tool it has no reason to call.
 *
 * @param {Record<string, Function>} seed Raw handlers, keyed by tool name.
 * @param {{scope: string, skill: string, phase?: string, live?: string[]}} options
 */
export function seedStartup(seed, { scope, skill, phase = 'startup', live = ['An observation.'] }) {
  const library = seed.create_library({ slug: 'standards', title: 'Standards', doc_type: 'reference' });
  seed.create_library_scope({ document_id: library.id, scope });
  seed.create_document_section({
    document_id: library.id, heading: 'Standard', body: 'One host, no queue worker.', position: 0,
  });

  // A document scoped to something else, so the scope filter has something to exclude — **and it
  // carries a section of its own**, because the exclusion is counted in sections consulted rather
  // than in documents seen. Without the section a run that ignored the scope entirely consulted
  // the same one section and passed every assertion; that mutation survived until it did not.
  const other = seed.create_library({ slug: 'elsewhere', title: 'Elsewhere', doc_type: 'reference' });
  seed.create_library_scope({ document_id: other.id, scope: `not-${scope}` });
  seed.create_document_section({
    document_id: other.id, heading: 'Elsewhere', body: 'Something for another skill.', position: 0,
  });

  const retro = seed.create_retro({ slug: 'round-one', title: 'Round one' });
  const terms = seed.list_taxonomy({ domain: 'observation', limit: 100 }).items;

  const observations = live.map((text, position) => {
    const observation = seed.create_observation({ retro_id: retro.id, position, text });
    seed.create_observation_category({
      observation_id: observation.id, taxonomy_id: terms[position % terms.length].id,
    });
    return observation;
  });

  seed.create_observation({
    retro_id: retro.id, position: live.length, text: 'A lesson that has since been spent.',
    retired_at: '2026-01-01T00:00:00.000Z', retired_reason: 'the module it warned about is gone',
  });

  const earlier = seed.create_session({ id: 'session-before', skill, phase, state: '{}' });

  return { library, other, retro, observations, earlier };
}

/**
 * Drive it: session, roster, scoped library, retro awareness. Returns what the run learned, so a
 * test can assert on the selection rather than only on the calls.
 *
 * **Three of the four blocks are optional, because only the library check is universal.** Each
 * defaults to on and is switched off by a skill that genuinely does not run it — `spec` and
 * `discover` load the roster for **Perspectives** where `epics` and `do` never name `list_agent`;
 * `status` opens no session at all, having nothing to resume, and consumes no retro, a report being
 * the one output a lesson cannot change. Driving a block unconditionally would demand the file name
 * tools it has no use for, which is the binding failing on a run the test invented rather than on
 * anything the skill got wrong. Driving one that *is* run but switched off here is the same failure
 * mirrored, so a flag is a claim about the skill and worth checking against its file.
 *
 * @param {Record<string, Function>} call The dispatcher — recorded, ordered, or both.
 * @param {{earlier: object}} fixture From `seedStartup`.
 * @param {{scope: string, skill: string, attempt?: number, adopt?: boolean, roster?: boolean,
 *   session?: boolean, retro?: boolean}} options `attempt` keys the session ids, because a second
 *   run against one database collides on the primary key and on the adoption recorded against the
 *   row it supersedes.
 */
export function driveStartup(call, fixture, {
  scope, skill, attempt = 1, adopt = true, roster: wantsRoster = true,
  session: wantsSession = true, retro: wantsRetro = true,
}) {
  if (wantsSession) {
    call.list_session({});
    if (adopt) {
      call.adopt_session({
        id: `session-now-${attempt}`, predecessor_id: fixture.earlier.id, include_body: true,
      });
    }
    call.create_session({ id: `session-run-${attempt}`, skill, phase: 'startup', state: '{}' });
  }

  const roster = wantsRoster ? call.list_agent({}).items : [];

  const consulted = [];
  for (const document of call.list_library({}).items) {
    const scopes = call.list_library_scope({ document_id: document.id }).items;
    if (!scopes.some((entry) => entry.scope === scope || entry.scope === 'all')) continue;

    for (const heading of call.list_document_section({ document_id: document.id }).items) {
      consulted.push(call.read_document_section({ id: heading.id, include_body: true }));
    }
  }

  const terms = wantsRetro ? call.list_taxonomy({ domain: 'observation', limit: 100 }).items : [];

  // **No `.filter()` on `retired_at` here, and its absence is the assertion.** The list declares
  // `live: 'retired_at'`, so a retired observation is excluded by a `WHERE` clause unless the
  // caller asks for it. A filter in the run would pass whether or not that clause existed, and the
  // seeded retired row would go on being excluded by the test rather than by the tool.
  const observations = wantsRetro
    ? call.list_retro({}).items
      .flatMap((retro) => call.list_observation({ retro_id: retro.id, include_body: true }).items
        .map((entry) => ({
          retro,
          observation: entry,
          categories: call.list_observation_category({ observation_id: entry.id }).items
            .map((row) => terms.find((term) => term.id === row.taxonomy_id)),
        })))
    : [];

  return {
    roster, consulted, observations, session: wantsSession ? `session-run-${attempt}` : null,
  };
}

/**
 * The three directions, as problems rather than assertions — the block every conversion test ends
 * with, held in one place now that there are three of them and nineteen more to come.
 *
 * Returning problems rather than asserting reports **every** drift with the name that caused it,
 * where a run of assertions stops at the first; on a conversion that has lost two calls, seeing one
 * of them is how the second survives a fix-and-rerun. It is also what lets a test drive a source
 * that is wrong on purpose, which is how the sweep itself is checked.
 *
 * @param {string} source The SKILL.md.
 * @param {object[]} tools The live registry.
 * @param {{used: Set<string>, passed: Map<string, Set<string>>}} run From `recorder`.
 * @returns {string[]}
 */
export function bindings(skill, tools, { used, passed }) {
  const source = reachable(skill);
  const named = toolNames(source);
  const known = new Set(tools.map((tool) => tool.name));
  const problems = [];

  for (const name of named) {
    if (!known.has(name)) problems.push(`the skill instructs a run to call ${name}, which is not a tool`);
  }

  for (const name of [...used].sort()) {
    if (!named.includes(name)) {
      problems.push(`the test drove ${name} and the skill never names it — one of the two has drifted`);
    }
  }

  // **A write's subject, and a read's result shape.** The two halves below are the same rule — an
  // argument nothing forces the run to supply is one the file has to ask for — applied to the two
  // places it bites.
  //
  // On a **write**, that is the record itself: an optional column the file never names is a column
  // that does not get written. On a **read**, it is deliberately *not* the query. "`list_task` per
  // story" has already said `story_id` without naming the column, and demanding the column would
  // make every discovery step recite its own joins — the first cut of the write direction did
  // exactly that and reported noise across seven tests. What a read's prose does **not** say is what
  // comes back, and that is what `READ_DECISIONS` covers.
  for (const tool of tools.filter((entry) => used.has(entry.name))) {
    const write = /^(create|update)_/.test(tool.name);
    const read = /^(list|read|search)_/.test(tool.name);
    if (!write && !read) continue;

    for (const argument of write ? valuedArguments(tool) : READ_DECISIONS) {
      if (!passed.get(tool.name)?.has(argument)) continue;
      if (!(argument in (tool.inputSchema?.properties ?? {}))) continue;

      // Matched inside a code span but not to its end, because a skill names an argument both
      // bare (`class`) and with the value it should carry (`polarity: 'must_not'`).
      if (!new RegExp(`\`${argument}\\b`).test(source)) {
        problems.push(write
          ? `the run passes ${argument} to ${tool.name} and the skill never names it — `
            + 'a value nothing instructs the run to supply is a value the next reader infers'
          : `the run passes ${argument} to ${tool.name} and the skill never names it — `
            + 'a read whose result shape nothing prescribes returns something else to the next reader');
      }
    }
  }

  return problems;
}

/**
 * The read arguments a skill is answerable for: the ones that change **what comes back** rather
 * than what is being asked about.
 *
 * **Every one of these fails silently, which is why they are the exception to reads being exempt.**
 * A `read_document_section` without `include_body` returns a heading and no text, and a run that
 * forgot it reads nothing and does not know — the same shape as the handoff bug Epic 47-06's
 * pipeline found, where `list_requirement` withheld `text` and a verbatim fragment hashed
 * `undefined`. A `list_taxonomy` without `limit` stops at the default fifty, so a project with sixty
 * terms loses ten and the run reports on the rest. `include_retired`, `include_superseded` and
 * `ready` are the same again: each moves a `WHERE` clause, and a file that does not name one has
 * left the next reader to guess which set they are looking at.
 *
 * The scopes stay out. A skill prescribes those in words, and `MECHANICAL`'s reasoning holds for
 * them — this set is the part of a read that prose does not reach.
 */
const READ_DECISIONS = [
  'limit', 'offset', 'include_body', 'include_retired', 'include_superseded', 'ready',
];

/**
 * The arguments a skill is answerable for — every declared argument except the mechanical ones a
 * run supplies without being told to.
 *
 * **This used to be the `enum` arguments alone, and three stories running lost a mutation to that.**
 * The narrow reading caught a band or a polarity dropped back into prose, which is the commonest
 * shape; but a boolean (`chosen`) and a foreign key (`scope_story_id`, `remediation_task_id`) fail
 * in exactly the same way and were invisible. In each case the write step could be deleted from the
 * SKILL.md outright and every test still passed, because the *test* supplies the argument whatever
 * the file says — so the direction that exists to catch "a value nothing instructs the run to
 * supply" was blind to two thirds of the values. Each was closed with a direct prose assertion, and
 * a third workaround is the point at which the direction is the thing to fix.
 *
 * **The discriminator is optionality, not type.** A *required* argument is forced by the call: a
 * section has to say which document it is on, a tradeoff which option — so a file that says "each
 * option as `mcp__plugin_dpm_dpm__create_adr_option`" has already prescribed `adr_id`, and demanding it name
 * the column would push every file into writing the mechanics down. An *optional* argument is the
 * opposite: nothing makes the run supply it, so if the file does not ask for it, it does not
 * happen. That is precisely the set the three survivors came from — `chosen`, `scope_story_id`,
 * `remediation_task_id`, and Story 2's `parent_id` — and precisely why they were invisible.
 *
 * Enum arguments stay in whether or not they are required, because a fixed set of terms is a
 * decision even where the slot is compulsory: `class`, `moscow` and `polarity` are the shapes a
 * conversion drops back into prose as a heading. `MECHANICAL` then exempts the handful a run holds
 * from the call that returned it, plus the paging and body flags a read carries.
 *
 * @param {object} tool
 * @returns {string[]}
 */
export function valuedArguments(tool) {
  const schema = tool.inputSchema ?? {};
  const required = new Set(schema.required ?? []);

  return Object.entries(schema.properties ?? {})
    .filter(([name, property]) => !MECHANICAL.has(name)
      && (!required.has(name) || Array.isArray(property.enum)))
    .map(([name]) => name);
}

/** Arguments a run supplies from what it already holds, which no skill file should have to name. */
const MECHANICAL = new Set(['id', 'limit', 'offset', 'cursor', 'include_body']);
