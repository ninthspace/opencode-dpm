# Guard, documentation and host behaviour

**Number**: 01-04  
**Source spec**: 01  
**Status**: complete  

## Where OpenCode puts a git-installed plugin

Observed against a real install rather than read from documentation, in an isolated XDG root so the machine's own OpenCode configuration was untouched:

```
XDG_CONFIG_HOME=… XDG_DATA_HOME=… XDG_CACHE_HOME=… opencode2 plugin add github:ninthspace/opencode-dpm
```

**The package lands at `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/<package name>/`** — by default `~/.cache/opencode/packages/git-<hash>/node_modules/opencode-dpm/`. The configuration entry goes to `$XDG_CONFIG_HOME/opencode/opencode.json` as `plugins: ["github:ninthspace/opencode-dpm"]`, an array of specifier strings.

**`<hash>` is sha256 of the literal specifier string**, and that is derived rather than assumed: `sha256("github:ninthspace/opencode-dpm")` is `fb2f92df39b7c4694b7ec16c3d37931dcf7714f676af4abaade9056b7b090f8c`, which is the directory name after the `git-` prefix, byte for byte. Confirmed a second time from the other direction — installing `github:ninthspace/opencode-dpm#main`, the same repository under a different specifier string, produced a *second* directory named for that string's hash. So the hash is over the text somebody typed, not over the repository or the commit it resolved to.

Each `git-<hash>` directory is an ordinary npm install root: a two-line `package.json`, a `package-lock.json`, and `node_modules/`. The lock pins the resolution to a commit — `git+ssh://…/opencode-dpm.git#1120b7a34d3c4790b8fe0166a1469cdcf8b116a1` — so the specifier is what names the directory and the lockfile is what records which commit is in it.

## What this changes about the guard's symlink

**There is no version in the path, and that is the difference from Claude Code.** A Claude Code plugin lived at `…/plugins/cache/<marketplace>/dpm/<version>/`, so an upgrade installed *beside* the old release and left a `.git/hooks/pre-commit` symlink pointing into the previous one — the stale-guard case `src/guard/main.ts` refuses on, and the reason the README says to re-run the link with `-f` after every upgrade.

Under OpenCode the directory name is a function of the specifier alone, so re-resolving the same specifier can only write into the same directory. A symlink made against it survives an upgrade of that specifier. **This is a derivation from an observed fact and not itself observed**: showing an upgrade in place needs a new commit upstream to pull, which this run could not produce. What was observed is that the name is `sha256(specifier)`, twice, and that two different specifier strings for the same repository get two directories.

Two consequences, both worth carrying into the README:

- **`sort -V | tail -1` is meaningless here.** The old instruction sorted a version out of the path; there is no version, and sorting hex hashes orders nothing. The replacement sorts by modification time and takes the newest install: `ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1`.
- **The stale-guard refusal stays reachable and its explanation does not.** A user who pins two specifiers — a tag and a branch, say — has two installs of different ages and can link against the older, so the refusal in `src/guard/main.ts` still earns its place. The sentence explaining *why* it happens describes Claude Code's mechanism, and under OpenCode the ordinary upgrade is not it.

## Two things that did not work, recorded rather than chased

- **`opencode2 plugin list` reported "No plugins found"**, run twice, against a configuration file declaring two plugins. The control is uninformative — the machine's real configuration declares none, so the same answer there is correct — which means nothing here establishes what that command reads.
- **The host log records only CLI starts, and no plugin load.** So this section is evidence about *where a git install lands* and about nothing else. Whether a plugin registers from that location is epic 01-02's ground, established there against a local path rather than a git specifier.

## What the five stories had in common

Synthesis across the epic's five story observations, written because signals fired during the loop: the test command returned failures on two separate stories, and a README draft was killed at review.

**The same defect four times: a check whose scope was set by where somebody expected to find the thing.** Story 1 found `/dpm:publish` in `src/guard/index.ts` — a Claude Code slash command surviving three epics of the port, including the epic that built a CI check for exactly that string, because the check walks `skills/` and `shared/` and the guard is the one module in `src/` that writes prose a user acts on. Story 3 found a criterion whose antecedent was empty, which passes identically whether the sweep found nothing, read nothing, or stopped matching. Story 4's README test would have run the blocks it recognised and reported clean on the one added last week. Story 5's first README draft named both permission axes and would have left a reader confident they had covered publishing.

Four different surfaces, one shape: **the reading was bounded by an assumption nobody had written down**. What fixed each was the same move — enumerate the population, hold it against a written classification, and fail in both directions. `session-scratch.test.js` fails when a new `process.env` read is unclassified; `readme-v2.test.js` fails on an unmatched block *and* on a rule that matches nothing; `permission-entries.test.js` fails when a documented rule names a skill or tool that does not exist. None of them assert an absence directly, because an absence asserted is an absence nobody looked for.

**Two findings about matching on strings, from opposite ends of the epic.** Story 1: `dpm-publish` is a substring of `bin/dpm-publish.ts`, so three assertions asking "does this refusal offer the publish skill" were answerable by a path, and one passed for that reason — fixed by exporting the phrase rather than the id. Story 4: the beta callout could not be found by searching for its own opening sentence, because the TL;DR says the same thing more briefly and the anchored match found that one — fixed by extracting the blockquote as a blockquote. Both are the same lesson at different scales: **a string that appears in prose is not an identifier, and matching on one gives an answer that is confidently about the wrong occurrence.** Retro 02 recorded this from a third angle. Three sightings is a pattern rather than a coincidence.

**Where the epic declined to automate, and why that is not a gap.** Story 5's two behavioural criteria and story 2's location criterion are `manual`, and stay so. A test asserting the host's permission semantics would assert this run's transcription of them and pass exactly as well when the transcription is wrong; what the test files check instead is the half a person cannot recheck every commit — that every documented rule names something that exists, that the documented instruction resolves to a file. The transcribed glob matcher in `permission-entries.test.js` is the one thing taken on trust and is named as such in the file.

**State left by an earlier story is state the next one inherits.** Story 2's XDG-rooted scratch install was the right fixture and it made story 5's probe return nothing at all, three times, with no symptom pointing at the cause — two git specifiers left in the scratch global config plus the project's local path is three plugins claiming `id: dpm`, and OpenCode kills the *entire* plugin load rather than the duplicate. A working probe presents as a hung one. The host log named it; nothing else would have.

**Left open, and belonging to no story here.** `/dpm:templates`, `/dpm:do` and `/dpm:epics` remain in JSDoc in `src/tools/cross/template.ts`, `src/coverage/warrant.ts` and `src/preview/example.ts` — the same staleness story 1 fixed, in comments rather than output. And `DATABASE` is a relative path, so which directory OpenCode hands a spawned local MCP server decides which repository `.dpm/` lands in; every test here runs the server against an explicit root, so nothing in this epic reaches that question.

## Story 1 — Guard at OpenCode's hook path

**Status**: complete — All six criteria met; six of six coverage rows verified.  
**Blocked by**: Story 4  

### Acceptance Criteria

- The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch. `[integration]`
- Each of the four refusal cases produces its own explanation, distinguishable from the other three. `[integration]`
- Starting the server in a repository with no hook symlink installed emits the missing-symlink warning. `[integration]`
- In a temporary git repository, the guard hook installs at the repository's hook path and refuses a commit whose projection is stale, with the explanatory output intact. `[integration]`
- `git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit. `[integration]`
- must NOT — The guard writes to the working tree or repairs any discrepancy it finds. `[integration]`

### Task 1 — Port the guard to the v2 hook path

**Status**: complete — The hook path and the executable were already v2 — epic 01-01 converted `hooks/pre-commit` to invoke `node .../bin/dpm-guard.ts` and the hook resolves its own symlink chain before doing so. What was not ported was what the guard tells the reader to invoke: `describe()`'s divergence branch ended `or run /dpm:publish if you are already in a session`, a Claude Code slash command that v2 does not mint. Replaced with the v2 invocation — the built-in skill tool and the registered id — as a new `PUBLISH_SKILL` export composed from `ID_PREFIX`, imported from `src/plugin/skills.ts` so the prefix has one definition. The skill name stays written rather than derived from `COMMANDS.publish`, because tying a skill id to a binary filename would point it at a skill nobody registered the day the binary is renamed; `guard-fix.test.js` asks the filesystem for the skill body instead, the same way it already asks for the binary.  

Regenerate-and-compare is unchanged in kind. Addresses where the hook lives and what it invokes, not what it decides.

### Task 2 — Carry over the missing-symlink warning on server start

**Status**: complete — No code change was needed and the check is what says so rather than a reading. `open()` still asks `unguardedMessage` about the database directory and puts the answer on stderr, and the v2 registration does not disturb it: `localServer()` registers `node <root>/bin/dpm-mcp.ts` as a local MCP server, which is the same stdio subprocess Claude Code spawned, so stderr still reaches the host's log. What was missing was evidence — `hook-check.test.js` drives `open` with the check injected, which establishes that whatever the check says reaches stderr and not that the real check says anything. The new file drives the real composition both ways. One v2 question is left with story 3, where its criterion already sits: the default location is relative (`.dpm/dpm.db`), so which directory OpenCode gives a spawned MCP server as cwd decides which repository this warning is about.  

Addresses the warning path in the server, not the guard's own refusals.

### Task 3 — Write tests for "Guard at OpenCode's hook path"

**Status**: complete — `tests/guard-hook-path.test.js`, five tests. The two the story lacked entirely: `git --version` at or above 2.9 with the comparison driven against 2.8.6 and 1.9.0, and the real `unguardedMessage` reaching stderr through the real `open()` — paired with a guarded repository that stays silent. The four refusals are compared to each other rather than each to a string, since four assertions that each pass against one constant is what "distinguishable from the other three" rules out. The last test sweeps all four refusals and the clean line with `HOST_MECHANISM` imported from the CI check, and its control is the sentence this story replaced. That control earned its place: matching the bare id `dpm-publish` reported the skill as offered in the unknown case, because it is a substring of `bin/dpm-publish.ts` — the same shape retro 02 recorded from the other side. Fixed by exporting the phrase `PUBLISH_INVOCATION` and matching on it, in this file and in the two existing assertions that had the same latent bug.  

Covers the four distinguishable refusal cases, the stale-commit refusal in a temporary repository, and the rejection of any working-tree write.

### Retro

- **The port swept `skills/` for host mechanisms and never swept `src/`, and the guard is the one module in `src/` that writes prose a user acts on.** `describe()`'s divergence branch ended `or run /dpm:publish if you are already in a session` — a Claude Code slash command v2 does not mint — and it survived three epics of the port, including the epic that built a CI check for exactly this class of string. The check walks `skills/` and `shared/` because that is where the criterion pointed; nothing asked whether the prohibition had a second home. It is printed at the moment a reader is most likely to type what they are told, since the commit they just made was refused.

**Two smaller findings came out of fixing it, and the second is the reusable one.** First, the comment references that remain (`/dpm:templates`, `/dpm:do`, `/dpm:epics` in `src/tools/cross/template.ts`, `src/coverage/warrant.ts`, `src/preview/example.ts`) are stale in the same way but are JSDoc rather than output, and no story in this epic covers them.

Second: matching the message against the bare skill id `dpm-publish` reported the skill as offered in the one refusal that must not offer it, because `dpm-publish` is a substring of `bin/dpm-publish.ts`. Three assertions were written that way and one passed for that reason. Retro 02 recorded the same shape from the other side — a search for a replaced string matching inside the absolute path that replaced it. The fix was to export the *phrase* rather than the id and match on that, so a caller asking "does this message offer the publish skill" cannot be answered by a path.

**How to apply**: when a prohibition is enforced over one directory, ask what else in the tree produces the same kind of artefact before recording the rule as enforced. And when a new identifier is a substring of an existing path, the identifier is not a safe thing to match on — export the phrase that contains it.

## Story 2 — Confirm the package cache location and the symlink target

**Status**: complete — Both criteria met; two of two coverage rows verified.  
**Blocked by**: Story 4  

### Acceptance Criteria

- The filesystem location where OpenCode places a git-installed plugin package is confirmed against a real install and recorded as a section on this epic. `[manual]`
- The documented symlink instruction, followed in a fresh project, resolves to an existing file. `[integration]`

### Task 1 — Install the plugin from git and observe where the package lands

**Status**: complete — Installed for real, into an isolated XDG root so the user's own OpenCode config was not touched: XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME pointed at a scratch directory, then `opencode2 plugin add github:ninthspace/opencode-dpm`. The package landed at $XDG_CACHE_HOME/opencode/packages/git-fb2f92df…/node_modules/opencode-dpm/, and the directory name is not opaque — sha256 of the literal specifier string is fb2f92df39b7c4694b7ec16c3d37931dcf7714f676af4abaade9056b7b090f8c, matching byte for byte. Confirmed a second time by installing `github:ninthspace/opencode-dpm#main`, which produced a second directory whose name is sha256 of that string. `hooks/pre-commit` ships in the tree at mode 100755, and `src/plugin/` arrives whole. Two things did not go as expected and are recorded rather than chased: `opencode2 plugin list` reported "No plugins found" twice against a config declaring two, and the host log shows only CLI starts — no plugin load — so nothing here establishes that a git-installed plugin registers, only where it lands.  

A real install rather than a reading of the documentation, since this decides whether the symlink instruction is correct.

### Task 2 — Record the location as a section on this epic

**Status**: complete — Recorded as the section "Where OpenCode puts a git-installed plugin" on epic 01-04. It carries the path, the hash derivation with both confirmations, what the absence of a version in the path changes about the guard's stale-link story — marked as a derivation rather than something observed, since showing an upgrade in place needs a commit upstream this run could not produce — and the two probes that returned nothing.  

What the README's symlink instruction is written against.

### Task 3 — Write tests for "Confirm the package cache location and the symlink target"

**Status**: complete — `tests/package-cache.test.js`, four tests, plus the README rewritten in all five places the old `~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1` appeared. The instruction is extracted from the README and executed rather than transcribed, so a command that ships and a command that is tested cannot differ. The cache is built under a scratch XDG_CACHE_HOME rather than found: the real one exists only on a machine that has installed the plugin, and reaching for it would pass here and skip in CI, which is the false pass this project keeps rediscovering. Three controls — an empty cache leaves no working hook (since `ln -s` succeeds against a target that does not exist), two installs of different ages resolve to the newer, and the clone-form instruction the reading deliberately excludes is named rather than counted out. The last test reads the package name from `package.json` and asserts the cache root is `${XDG_CACHE_HOME:-$HOME/.cache}` rather than a hard-coded `~/.cache`.  

Covers the documented instruction resolving to an existing file. The observation itself is tagged `manual`.

### Retro

- **The install could be done for real without touching the machine, and that changed what the story was allowed to conclude.** `opencode2 plugin add` writes to the global configuration, which is the user's live setup — so pointing `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` at a scratch directory bought a genuine `plugin add` against the real GitHub remote with no side effect to undo afterwards. The criterion asked for a real install and got one; nothing had to be inferred from documentation.

**The location turned out to be derivable, and checking that was worth more than reading it.** The package lands at `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/opencode-dpm/`, and `<hash>` is sha256 of the literal specifier string — `sha256("github:ninthspace/opencode-dpm")` matches the directory name byte for byte. Confirmed from the other direction by installing `github:ninthspace/opencode-dpm#main`, the same repository under a different string, which produced a *second* directory. So the hash is over the text somebody typed, not over the repository or the resolved commit.

**That killed the old instruction rather than relocating it.** The Claude Code form ended `sort -V | tail -1`, which sorted a version out of the path. There is no version in an OpenCode package path, and sorting hex digests orders nothing — so the replacement sorts by modification time. The same fact reaches the guard: `src/guard/main.ts` refuses a database from a newer release and explains it as "an upgrade installs beside the previous release rather than over it", which is Claude Code's mechanism. The refusal stays reachable — two specifiers for one repository give two installs of different ages — but the sentence explaining why no longer describes the ordinary case.

**Two probes returned nothing and were recorded rather than chased**, per the bound this run put on host probing: `opencode2 plugin list` said "No plugins found" twice against a configuration declaring two, and the host log shows only CLI starts and no plugin load. The control is uninformative — the machine's real configuration declares no plugins, so the same answer there is correct — so the section says what it establishes (where a git install lands) and explicitly not what it does not (that a plugin registers from there).

**How to apply**: an XDG-rooted scratch turns "install it for real" from a change to the user's machine into an ordinary test fixture, and it should be the first thing reached for when a criterion asks for a real install. And when a path stops carrying a version, every instruction that *ordered* by that path is broken rather than merely relocated — grep for the sort, not only for the prefix.

## Story 3 — Session scratch via plugin storage

**Status**: complete — Three criteria met; three of three coverage rows verified. Nothing moved to storage — see task 1.  
**Blocked by**: —  

### Acceptance Criteria

- Anything that was per-session scratch keyed by an environment variable uses `ctx.storage` where a database session row is not already the answer. `[unit]`
- On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish. `[integration]`
- must NOT — A transient file lands in the project tree. `[integration]`

### Task 1 — Audit what was per-session scratch keyed by an environment variable

**Status**: complete — The audit found nothing that was per-session scratch keyed by an environment variable. The plugin reads exactly two variables, both inherited unchanged from v0.7.0: `DPM_READ_ONLY` in `src/server/read-only.ts` — a launch mode resolved once at bring-up and passed down — and `DPM_DATABASE` in `src/db/location.ts` — a path override read at module load because it is a process-level setting. `src/server/warnings.ts` names `NODE_NO_WARNINGS` only in prose explaining why it cannot be set from inside the process, so it is not a read. No `CLAUDE_`-prefixed variable is read anywhere in the plugin; `suite-integrity.test.js` already holds that, established in epic 01-01. The per-session state dpm does keep is the `session` table, which the criterion explicitly exempts. Checked before concluding, per the retro lesson about criteria naming mechanisms: `ctx.storage` does exist — the SDK's `StorageDomain` carries get, set, remove and scan — so the criterion names something real and simply has no candidate to move into it.  

Names each site and whether a database session row already answers it. Addresses the inventory, not the migration.

### Task 2 — Move the remainder to ctx.storage

**Status**: complete — Nothing to move, so nothing was moved — and the task's own description says so: "only what the audit found unanswered by a session row". Adding a `ctx.storage` call with no state to put in it would be a mechanism with no caller, which is worse than none: the next reader would take its existence as evidence that something needs it. What the story delivers instead is the enumeration that makes "nothing to move" checkable, and a tripwire — a new environment read fails `session-scratch.test.js` until somebody classifies it as scratch or not.  

Only what the audit found unanswered by a session row. A row that already holds the fact is left alone.

### Task 3 — Write tests for "Session scratch via plugin storage"

**Status**: complete — `tests/session-scratch.test.js`, four tests. The first enumerates rather than asserts a negative — a criterion with an empty antecedent is satisfied by doing nothing, and an empty sweep, a regex that stopped matching and a genuine absence are three facts wearing one empty array — so it names the set, holds it equal to the classification table, and drives the reading against three planted sources including one where the variable appears only in a comment. The second asserts the exemption the conclusion rests on: the session tools exist and a row carries a state blob, so "a database session row is already the answer" is a fact rather than an assumption. The third takes a fresh repository from first run to two publishes and asserts the dump was rewritten, not merely written. The fourth walks everything on disk after a full run and requires each file to be a committed artefact or ignored, with a planted `dpm-loop.local.md` proving the reading reports one when there is one. One thing this does NOT establish, and it is left with the story rather than claimed: `DATABASE` is relative, so which directory OpenCode gives a spawned local MCP server as cwd decides which repository `.dpm/` appears in. That is a fact about the running host and no `integration` criterion here reaches it.  

Covers the storage criterion, the `.dpm/` first-run behaviour, and the rejection of any transient file landing in the project tree.

### Retro

- The story's first criterion has an empty antecedent — "anything that was per-session scratch keyed by an environment variable uses ctx.storage" — and the audit found the antecedent empty. That shape passes by doing nothing, and it passes identically whether the sweep found nothing, the sweep read nothing, or the regex quietly stopped matching. Three different facts, one empty array. What made the difference was refusing to assert the negative: `session-scratch.test.js` enumerates the environment reads, holds the set equal to a written classification table, and drives the reading against three planted sources including a commented-out one. A new `process.env.X` now fails until somebody classifies it, so the empty antecedent stays checked rather than merely being true today.

Two things fell out of doing it that way. The exemption the conclusion leans on — "where a database session row is not already the answer" — is only a defence if the row exists and carries state, so that became its own test rather than an assumption in a comment; the sweep alone would be equally empty in a release that had lost sessions altogether. And the classification is written down rather than derived, because a variable's name says nothing about whether it holds state between calls; what is mechanical is only that the two sets match.

Left open and not claimed: `DATABASE` is a relative path, so which directory OpenCode gives a spawned local MCP server as its cwd decides which repository `.dpm/` lands in. Every test here runs the server against an explicit root, so nothing here reaches that question — it is a fact about the running host, of the same class as the ones epic 01-04 story 4 and the `target` criteria elsewhere leave to the deployment.

## Story 4 — README for a v2 audience

**Status**: complete — Four criteria met; four of four coverage rows verified. Two things were removed that the task list did not ask for and the README could not keep: `MIGRATION.md`, whose migration happens under Claude Code while CPM is still installed, and the board section, which documented a `tools/board/` this fork has never tracked.  
**Blocked by**: —  

### Acceptance Criteria

- Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. `[manual]`
- Every command the README gives runs as written in a fresh project. `[integration]`
- The README states that OpenCode v2 is beta and that entrypoints may move under it. `[unit]`
- must NOT — The repository contains a CPM `MIGRATION.md`. `[unit]`

### Task 1 — Rewrite install, first run, guard symlink and "when the guard refuses"

**Status**: complete — **Requirements** now names OpenCode v2 as the host and Node **24**, not 22.5.0 — the floor moved when the port went to native type-stripping and `src/server/node-floor.ts` has said 24 since epic 01-01, so the README had been a release behind the thing it documents. Both reasons are given, because either alone would set the floor.

**Installation** is `opencode2 plugin add github:ninthspace/opencode-dpm`, replacing the two `/plugin marketplace` lines. The paragraph after it is the fact story 2 established and nothing else documents: the specifier string *is* the identity of the install, because OpenCode names the package directory for a digest of it, so a tag and a branch are two installs of the same repository cached and upgraded separately. That matters for exactly one thing — which install the pre-commit symlink points into — and it says so and sends the reader to First run. The develop-on-DPM route became a `plugins` entry naming the entry *file*, since `{ "package": … }` wants a file and a directory silently fails to load.

**First run** step 2 no longer says `/dpm:publish`; it asks for the `dpm-publish` skill. The paragraph on the guard's refusal now says `node <package path>/bin/dpm-publish.ts` and explains that the path in the message is the absolute one the guard was loaded from, which is what `fileURLToPath` actually produces. Every remaining `<plugin path>/dpm/` became `<package path>/`, in "when something else owns the hook" as well, and that section gained the `ls -dt` one-liner that resolves it — it told a reader to paste a path into a `pre-commit` framework entry and a wrapper script without saying how to find one.

**When the guard refuses** keeps its three commands, which `findable.test.js` binds to `COMMANDS`, and its publish case now names the skill in the wording the refusal itself uses — story 1's `PUBLISH_INVOCATION`.

Two things found while doing it, neither of them in the task title.

The **TL;DR** carried "Re-make that symlink after every DPM upgrade", which is Claude Code's mechanism and is wrong here: an upgrade of the specifier you linked against rewrites that directory in place and the link survives. It is replaced by the specifier-digest rule. A stale paragraph in First run said the glob "picks the highest version number", also Claude Code's, and directly contradicted the `ls -dt` two paragraphs above it — story 2 rewrote the commands and missed this prose.

**The board section documented a directory this package does not contain.** `tools/board/` is in the v0.7.0 oracle and was never tracked in this fork — `git log --all -- tools/` is empty — so the README gave two `uv run` commands against files that are not there and linked a `tools/board/README.md` that does not exist. Its headline feature is a keypress that launches the right `/dpm:*` session, which is a Claude Code mechanism with no v2 equivalent, so it does not port as written either. Removed, with the Status table's row changed to say the board is not carried. Re-porting it is a decision for a later spec, not a README edit.  

For an `opencode2` audience, against the cache location story 2 confirmed and the refusal behaviour story 1 delivers.

### Task 2 — Remove the CPM MIGRATION.md

**Status**: complete — `MIGRATION.md` is gone from the working tree, and the two documents that pointed at it now say where the guide lives instead. The deletion is unstaged: version control is the user's.

**"Coming from CPM" survives, and that is deliberate.** The migration guide does not port — the move it describes happens while CPM is still installed, under Claude Code, which is not this host — but the one paragraph a reader cannot afford to skip does: the `git mv` that puts a CPM corpus out of the projection's reach before the first publish offers to delete it. That instruction is about *DPM's* reclaim rule, so it belongs with DPM wherever DPM runs. The section now opens by saying to migrate under Claude Code first and come here afterwards, and closes by sending the rest of the conversation there rather than to a file this package does not carry.

**`tests/cpm-corpus.test.js` read that file, and had to change with it.** Its `audit` held two documents to the same outcome *and to each other*, and the second document was `MIGRATION.md`. Rather than deleting the agreement check, `audit` now takes the documents as a **map** and reports each by name: the live call passes one, the invented control below passes a pair and still exercises the disagreement branch. The shape being checked is "the instructions a reader is given", which is a set whether it holds one or two, and the check starts constraining again the day a second document gives the same command. A new floor complaint — "no documents were audited" — covers the map being empty, which every check under it would otherwise pass on.

**And it broke `plugin.test.js`, which was worth fixing rather than waiting out.** That test reads the working-tree copy of every file the *index* tracks, so a deletion that is not yet staged threw `ENOENT: no such file or directory, open '…/MIGRATION.md'` — an error naming a path and nothing about why it was being read, from a test about file modes. It now names the mismatch itself ("the index tracks a file the working tree no longer has — stage the deletion and this reads the rest") and excludes those files from the mode comparison, whose question is moot for a file that is going away. The file's own JSDoc already separated "a mode drifted" from "the tree was never committed"; this is the third state of the same kind.

Verified without touching the index: `git add -A` into a copied `GIT_INDEX_FILE`, then `plugin.test.js` against that copy — 7 of 7 pass, so both this and the pre-existing shebang-mode failure clear on the next real `git add -A`. `git status` after it still shows ` D MIGRATION.md` and ` M scripts/skill-body-check.ts`, so nothing was staged.  

It does not carry over. Anyone on CPM migrates via the existing Claude Code dpm first.

### Task 3 — Write tests for "README for a v2 audience"

**Status**: complete — `tests/readme-v2.test.js` — six tests, all passing. It does not assert the README's commands; it **enumerates** them, which is the difference between a test that reads a document and one that reads the parts of it somebody remembered to list.

Every fenced block is matched against a rule, and both directions fail: a block no rule matches is a failure, and a rule matching no block is a failure too — the second because a rewrite that removed a command would otherwise leave a rule guarding an empty set and the file reporting clean. Four rules decline to run and each carries a `why` the test asserts is present: the install command reaches the network and rewrites the reader's config, JSON and YAML blocks are files rather than commands, and the three `bin/` invocations are already driven against real trees by `first-run`, `import` and `merge`. That set is asserted by name, so a command quietly joining the not-run list fails rather than passing.

Three things the runner found that a transcription would not have.

**`git config core.hooksPath` exits 1 when the key is unset, and unset is the answer the reader wants.** Absorbing that would have made every non-zero exit invisible; the rule declares `exits: [0, 1]` with the reason, and the test requires a reason wherever a rule accepts one.

**`sh` rejects `dpm-link()` before running a line of it.** POSIX allows only alphanumerics and underscore in a function name, so a hyphen is a syntax error in `sh` and `dash` and legal in `bash` and `zsh` — and `follow()` ran everything under `sh`. The block is not wrong: it is addressed to a reader's `.bashrc` or `.zshrc`. So the README now says which shells it is for and why, `follow` takes the shell as a parameter defaulting to `sh`, and the rule names `bash` with its reason. A rule that switched shells silently would have hidden a real gap in the prose, so the test also asserts the README itself names any shell a block needs.

**The beta paragraph could not be found by searching for the beta sentence.** The TL;DR says it too, deliberately and in a shorter form, so an anchored match found that one, reported the entrypoints warning missing from it, and was right about the wrong paragraph. The blockquote is now extracted as a blockquote, with an assertion that there is exactly one — the ambiguity is removed rather than worked around.

`tests/support/package-cache.js` came out of `package-cache.test.js` when this file needed the same fixture: two transcriptions of the cache layout is two places to edit and only one of them would be edited.

Full suite: 1080 tests, 1079 pass. The one failure is `plugin.test.js` reporting the unstaged `MIGRATION.md` deletion, by the assertion task 2 added for exactly that, and it clears on the next `git add -A`.  

Every documented command runs as written; the beta statement is present and `MIGRATION.md` is absent. The editorial judgement is tagged `manual`.

### Retro

- **Running the README found three defects that reading it could not.** The commands were not transcribed into the test and asserted; every fenced block was enumerated, classified by a rule, and executed. What that turned up: `git config core.hooksPath` exits 1 when the key is unset, which is the outcome the documented check is *looking for*; `sh` rejects `dpm-link()` as a syntax error because POSIX forbids a hyphen in a function name, so a block correct for the `.zshrc` it was written for is invalid in the shell a test runner reaches for by default; and the beta callout could not be located by searching for its own opening sentence, because the TL;DR says the same thing in a shorter form and the anchored match found that one — reporting the entrypoints warning missing from a paragraph that was never supposed to carry it.

The third is the one worth keeping. **The test was right that its match failed and wrong about what it had matched**, and nothing in the failure said so — it named two sections and neither of them by name. A search anchored on prose finds the first instance of that prose, and a document that deliberately says a thing twice at different lengths has more than one. The fix was to stop searching: the callout is a blockquote, so it is extracted as one, with an assertion that there is exactly one blockquote in the file. Structure the document actually has, rather than a phrase it happens to contain.

**Two of the three would have passed as documentation defects if the rule had bent instead.** Accepting any non-zero exit would have hidden every genuinely broken command; switching the block to `bash` without saying so in the README would have left a reader pasting non-POSIX syntax into a POSIX shell with a syntax error and no explanation. So both are declared at the rule with a reason the test asserts is present, and the shell case additionally requires the README itself to name the shell — the rule cannot quietly absorb a gap in the prose it is checking.

**The enumeration is what makes the file worth having**, and it fails in both directions: an unmatched block fails, and a rule matching nothing fails too. Without the second, a rewrite that removed a command leaves a rule guarding an empty set and the sweep reporting clean.

## Story 5 — Permission-aware behaviour

**Status**: complete — Three criteria met; three of three coverage rows verified. The two manual ones rest on the task 1 probe.  
**Blocked by**: Story 4  

### Acceptance Criteria

- Skills behave correctly under `ask` and `deny` rules for the `skill` action. `[manual]`
- The README documents the recommended permission entries. `[unit]`
- must NOT — A skill denied by a `deny` rule for the `skill` action performs its work anyway through another route. `[manual]`

### Task 1 — Exercise skills under ask and deny rules for the skill action

**Status**: complete — Exercised against a running host, not described. A probe plugin drove the host's own `skill` tool — the tool whose `execute` performs the `permission.assert` — under a project config carrying all three effects for the `skill` action, in the isolated XDG root story 2 built.

What the engine actually does, established before the run so the run had something to confirm: invoking a skill is the action `skill` with the skill's **id** as the resource; a rule set resolves by `findLast`, so the last matching rule wins and an unmatched request defaults to `ask`; config `permissions` are appended to every agent's ruleset, which is why an entry there beats the default agent's `{action:"*",resource:"*",effect:"allow"}`. Calling a dpm tool is a different action entirely — dpm registers an MCP server, and v2 names an MCP tool's action `<server>_<tool>`, so `dpm_publish`.

Four rows, all from one session:

- allow, `dpm-spec` — loaded, 19,176 characters, names itself.
- deny, `dpm-publish` — `Unable to load skill dpm-publish`, 0 ms, no body. The host asserts before it reads the file, so a denied skill's instructions never enter the conversation.
- ask, `dpm-retro`, replied `reject` — a pending request appeared carrying `action: "skill"`, `resources: ["dpm-retro"]`; the reply produced `Permission.DeclinedError` and no body.
- ask, `dpm-retro`, replied `once` — the same rule, a second pending request, 14,632 characters. Exercised in both directions, so `ask` is shown to be a question rather than a disguised deny.

The control is on the record: `present` lists all three ids as registered before any of it, because "Unable to load skill X" is also what a *missing* skill produces and a refusal means nothing without that.

The second-route check, which is the must-NOT's half: 23 ids, one per skill directory, each derived from its own front matter, so nothing is registered twice under a second name; no dpm tool returns skill content; `package.json` declares no `bin`, so the five executables are not on anyone's PATH. A cross-reference from a permitted skill to a denied one is the same tool call and refuses identically — that is row 2. What a `skill` deny does *not* stop is `dpm_publish` and the other 182 tools, which are separate actions under the host's own model; that is the README's to say, not a leak.

Three runs before these produced nothing at all, and the host log named the cause: `Duplicate plugin ID: dpm`. Story 2's install had left two git specifiers in the scratch global config, and with the project config's local path that is three plugins claiming the same id — which kills the entire plugin load, silently, so the probe read as a hung host. Set aside as `opencode.json.story2` and it ran clean.  

Includes checking that a denied skill does not reach its work by another route.

### Task 2 — Document the recommended permission entries in the README

**Status**: complete — A new `## Permissions` section in `README.md`, between "First run" and "When something else owns the hook". Self-contained, so story 4's rewrite of the surrounding sections has nothing to unpick here.

**Revised after review, and the revision is the substance.** The first draft offered a second recipe that put `ask` on `skill`/`dpm-publish`, which is advice nobody should take: the twenty-three skills are the product, they are how the method is followed at all, and a repository that denies one has a hole in the method rather than a tightened setup. The section now says that in as many words and recommends no skill restriction at all. What it recommends is an allow-list, for the one case where configuration is genuinely needed — a restrictive baseline DPM has to be let back through:

```json
{ "action": "skill", "resource": "dpm-*", "effect": "allow" },
{ "action": "dpm_*", "resource": "*", "effect": "allow" }
```

The confirmation recipe survives, moved to where the thing being confirmed actually happens: `{ "action": "dpm_publish", "resource": "*", "effect": "ask" }`, one line, on the tool. The paragraph beside it says why the skill rule is the wrong half — it governs whether the procedure is *loaded*, so gating it buys a confirmation for reading instructions and none for the deletion, and reads like the right one while doing it.

The rest is the two facts a reader needs and cannot get from the host's docs: loading a skill is the action `skill` with the skill's **id** as the resource, while running a tool is the tool's own name as the *action* with `*` as the resource; and rules resolve last-match-wins, unmatched defaults to `ask`, config entries append to the agent's own and therefore beat them. The closing paragraph covers `deny` as something met rather than chosen — inherited config, restricted agent — and is honest in both directions: the instructions never enter the conversation and there is no second route to them (one id per skill, no tool returning skill text, no executables on `PATH`, a cross-reference routed back through the same refusal), but DPM's tools are separate actions, so a denied skill is a method nobody can follow rather than a repository nothing can write to. Every claim there is a run from task 1 or a check made against the source.  

Addresses the entries themselves; the surrounding README rewrite is story 4.

### Task 3 — Write tests for "Permission-aware behaviour"

**Status**: complete — `tests/permission-entries.test.js`, five tests, plus the row in `suite-integrity.test.js`'s `ADDED`.

**What this file deliberately does not do is re-enact task 1.** The two behavioural criteria are `manual` because the host's permission engine is a fact about a running OpenCode; the evidence is the probe. A test asserting those semantics would be asserting my transcription of them, and it would pass exactly as well if the transcription were wrong. This project has never had a machine drive its own host, and inventing one here to make a `manual` criterion look automated would be the false pass with the check that is supposed to prevent it.

What a test does better than a person is the part the person cannot recheck on every commit: whether the documented rules name things that exist. A README rule is a string a reader pastes into their config, and every way it can be wrong is silent — a renamed skill, a split tool, a prefix changed by an ADR. A wrong rule does not error; it never matches, and the effect it was written to have stops happening with nothing reporting it.

The five: the section exists and its fenced blocks parse as well-formed rules, with the reader driven over a planted block carrying an effect the host would refuse, so an extractor that found nothing cannot pass as a section that was fine. Every `skill` resource matches at least one id `discoverSkills` returns, under the host's own glob rule transcribed from its matcher — with both directions of the matcher exercised, since a matcher that always says yes makes the loop vacuous. Every non-`skill` action is `dpm_`-prefixed and matches a registered tool, against the tools the server actually builds rather than a list. Then the claim the section rests on: `dpm_publish` is registered, declares `mutates`, and `unlinkSync` appears in exactly one source file — because if something else started removing files, "publish is the only DPM operation that deletes a file" would be false while every name in the section still resolved. And the must-NOT: no two skills share an id, `package.json` declares no `bin`, and the only reader of `SKILL.md` is the registrar — three absences, each with the control that the sweep read the package and found the one reader that must be there.

Suite: 1074 tests, 1073 pass. The single failure is the known `plugin.test.js` index-mode one carried in from commit 1120b7a and is not this epic's.  

Covers the documented entries. Behaviour under the host's permission engine is tagged `manual`, since the `ask` path needs a human answering the prompt.

### Retro

- The story's first README draft recommended putting `ask` on `skill`/`dpm-publish`, and the review that killed it asked one question: why would anyone deny a skill in this repository? They are all meant to be used. That is right, and the draft had drifted into demonstrating a mechanism rather than advising a reader — the criterion says "documents the recommended permission entries", and I had answered "documents the permission entries I had just learned how to exercise". Not the same thing. What survived is an allow-list for the one case that needs configuration, plus the confirmation moved onto `dpm_publish`, the tool that actually unlinks. The `deny` prose stays but is now framed as something met — inherited config, restricted agent — rather than something chosen.

The finding underneath it is worth keeping whatever the wording: loading a skill is the action `skill` with the skill's **id** as the resource, while running a dpm tool is the tool's own name as the *action*. Two axes, no overlap. A rule on one is invisible to the other, so the intuitive "gate the skill and its work is gated" is precisely wrong — the skill rule governs whether a procedure is read, and the writes happen under 183 separate tool actions. That is the section's whole reason to exist, and it is also why the first draft was dangerous rather than merely unnecessary: it named both halves and would have left a reader confident they had covered publishing.

Three probe runs produced nothing at all before the host log gave the cause: `Duplicate plugin ID: dpm`. Story 2's install had left two git specifiers in the scratch global config, and with the project config's local path that is three plugins claiming one id — which kills the *entire* plugin load rather than the duplicate, so a working probe presents as a hung one. Worth carrying: a scratch fixture built by an earlier story is state the next story inherits, and this one had no symptom pointing at it.

Where the story declined to automate: the two behavioural criteria are `manual`, and this project has always been tested by hand. A test asserting the host's permission semantics would assert my transcription of them and pass just as well when the transcription is wrong. So the test file checks the thing a person cannot recheck every commit — that every documented rule names a skill or tool that exists — and leaves the behaviour to the probe. The transcribed glob matcher is the one thing there taken on trust, and it is named as such in the file.

## Dependencies

- blocks → 01-05

## Retro Applied

- 02 · applied — Stories 3 and 5 are questions about a running host, so a probe leads rather than a reading of the SDK types. Bounded: the invocation walk cost seven attempts last epic, so this run stops and reports what the attempts established rather than repeating them.
- 02 · applied — Story 4's lens. A README restating a version, a path or a tool count that the code already computes is a second reading that goes stale silently — point at the source, and before asserting over an artefact grep for who else reads it.
- 02 · applied — v0.7.0 is installed on this machine and is the oracle for what the guard did and for what the README may claim. Every manual check in this epic states the evidence that the event under test actually occurred, beside the result.
- 01 · Criteria Gaps · applied — This epic's criteria name v2 mechanisms written before the host was opened — a hook path, a plugin storage API, a permission model. Each mechanism is checked to exist before anything is built against it; where one does not, the criterion is amended to the checkable and equally strong property with the citation, not written around.
- 01 · Patterns Worth Reusing · applied — Path containment is relative(a, b).startsWith('..') and never a substring test — the exact bug this observation caught, and story 2's symlink target is the same question in the same shape. Every claimed absence in this epic gets a control that would catch its presence.
- 01 · Testing Gaps · applied — Stories 1 and 2 are entirely about paths that resolve outside the checkout — OpenCode's hook path, the package cache directory, the symlink target. Each check anchors on evidence read at the target rather than on a constructed path, and an absent hook or absent cache is reported as a diagnostic rather than skipped.
