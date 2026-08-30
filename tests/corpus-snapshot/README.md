# The spec-47 planning corpus, frozen

A byte-for-byte copy of spec 47 and its twenty-six epic and coverage files, taken on 2026-08-16
from `docs/specifications/` and `docs/epics/` at the moment this repository migrated from CPM to
dpm. Four checks read it:

| Reader | What it takes from here |
|---|---|
| `tests/self-hosting.test.js` | every `### Self-hosting register` section, asserting no entry remains OPEN |
| `tests/corpus.test.js` | the `## Convert \`x\`` stories and their coverage matrices, rolling up the facilitation criterion |
| `tests/false-pass.test.js` | epic filenames, so a `closedIn` deferral cannot name an epic nobody wrote |
| `tests/support/register.js` | spec 47's `### The false-pass register` table |

## Why it is not under `tests/fixtures/`

That directory is spoken for. `tests/fixtures.test.js` carries a must-NOT — *"a fixture is a markdown
file parsed at load, rather than built by calling create tools"* — and enforces it with a recursive
scan refusing any `.md`, `.yaml` or `.json` under `tests/fixtures/`. Putting this corpus there failed
that check immediately, which was the right answer: a *fixture* in this suite means database state
built through the tool surface, so that no test can smuggle rows in by parsing a document.

Nothing here is a fixture in that sense. These documents are never loaded into a database; they are
the *subject* of four checks that read markdown because reading markdown is what those checks do.
Keeping them outside `tests/fixtures/` honours the rule rather than working around it — the scan
still finds no document under the directory whose discipline it guards.

## Why a copy and not a path

Until the migration these four read the repository's live `docs/`. The migration moved that corpus
to `docs/cpm/`, which broke all four — and repointing them there would have been worse than it
looks. `docs/cpm/` is parked by definition: nothing writes to it again. A check reading it would
have gone on passing over an archive while reading, at every call site, as though it still watched
the corpus the project was actually producing.

That distinction matters most for `self-hosting.test.js`, whose scan is explicitly written so that
"an entry raised by an epic written later is picked up". No later epic can arrive in a fixture — but
none can arrive in `docs/cpm/` either, and from epic 51 onwards they are rows in `.dpm/dpm.db`
rather than files anywhere. The property was lost to the migration, not to this directory. A fixture
is the same coverage stated honestly, which is the whole argument for it.

## The rule that survived, and the one that did not

**Survived**: nothing here is transcribed. Every reader still *parses the document* — the false-pass
register's table, the conversion headings, the coverage columns — rather than holding its own copy
of what those documents say. `tests/support/register.js` exists precisely to stop a hand-kept array
drifting from its source, and reading a frozen file keeps that intact. Scanning also still beats
listing: `readdirSync` over this directory is what finds every conversion story in it, so a reader
cannot silently omit one.

**Did not**: growth. These files are a snapshot and will never gain a row. Editing them to record
something new would be writing a planning document into a test fixture, which is not what this is
for.

## The self-hosting register is not read from here any more

This directory briefly carried a fourth reader. `self-hosting.test.js` swept these epics for their
`### Self-hosting register` tables and asserted that no entry was OPEN; the snapshot froze that
sweep, and the note here said a dpm-era register needed a home.

It was retired on 2026-08-16 instead, and the reasoning is in that file's header. Briefly: the sweep
asserted that somebody had written CLOSED in a table, while the claim with teeth — that the five
shapes the register was opened for survive a round trip — is a separate test that reads the
database. The register's own history is the argument, since all five entries were found by reaching
for something and watching it fail and none by reading. Its slot now holds an assertion of that
kind: every vocabulary term the release ships must be present in this project's committed database,
which is the check that would have caught the most recent such failure by itself.

The register tables are still here, inside these epics, as the record of what was found and how each
entry closed. Nothing reads them.

Do not add files here. This is a snapshot, and a planning document written into a test directory is
not a planning document.
