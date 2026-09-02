# DPM — Data-Modelled Planning Method

SQLite-backed persistence for planning artefacts. Every artefact is a row with typed
columns; every cross-artefact reference is a foreign key. Markdown under `docs/` is a
generated, one-way projection of the database rather than the place the data lives.

Skills write exclusively through typed MCP tools — no skill contains SQL, and nothing in
DPM parses prose.

## TL;DR

- **`docs/` is output.** DPM generates it from `.dpm/dpm.db`. Editing a file under it is
  writing into something with a generator behind it; the edit survives until the next
  publish and no longer.
- **The database is not committed.** `.dpm/dpm.sql` is its text form and is what a fresh
  clone rebuilds from, automatically, on the first tool call.
- **Two things to do once per repository**: symlink the pre-commit hook (with an
  **absolute** target), and publish before committing. Both are under *First run*.
- **DPM is installed from a clone, not with `opencode plugin add`.** Two keys in your
  `opencode.json` name the entry file and the skills directory in the checkout.
  *Installation* says why the packaged install is not offered — it is a runtime restriction
  rather than a preference, and it would give you the skills with none of the tools behind
  them.
- **The pre-commit hook is a symlink into that clone**, so it follows whatever you have
  checked out. A *stale* link refuses and tells you; a *missing* one is silent, and
  `.git/hooks/` is not tracked — so `ls -l .git/hooks/pre-commit` is worth running when
  you come back to a repository.
- **A refused commit is telling you which of four things happened**, and each has a
  different fix — publishing when you should have imported destroys what you pulled. The
  refusal names the command; *When the guard refuses* explains the choice.
- **The host is OpenCode v1.** DPM is built against it, and where the host moves, DPM
  follows — see *Requirements*.

## Requirements

- **OpenCode v1**, run as `opencode`, version 1.18.25 or later. DPM is an OpenCode plugin:
  it registers one MCP server and twenty-three skills, and there is no other host it runs
  under.

  **It takes two configuration keys, and only one of them is a plugin.** `plugin` loads
  DPM's entry file, whose `config` hook is the only handle v1 offers on the MCP registry.
  The skills do not come through a plugin at all: v1's plugin API has no skill hook, and
  the object protocol that does — a default `{ id, setup }` — is fed by a `plugins` key
  that v1 strips before any loader sees it. So the skills go in `skills`, a first-class key
  that points the host at a directory and lets it read the bodies itself.
- **Node 24 or later, and it must be the `node` OpenCode resolves.** DPM uses `node:sqlite`
  from the standard library and runs its own TypeScript by Node's native type-stripping, so
  there is no native module, no `node-gyp`, no loader and no build step — but both of those
  need 24. Below the floor, each of DPM's five executables refuses with a message naming the
  version you have and the version it needs, rather than failing on an unknown builtin or a
  syntax error in a type annotation.

  The server is registered as the bare command `node`, which the host looks up on **its own**
  `PATH` — not yours, and not a version manager's shell hook. If that `node` is older than 24
  the server refuses to start, and what you see is one line in the log:

  ```
  WARN server unavailable key=dpm type=local status=failed
  ```

  followed by a session with the skills present and no tools behind them. `opencode` started
  from a shell where `node --version` says 24 or later is the whole of the fix.

> **The plugin API is one the host is still free to change.** Entrypoints may move under
> it: the two protocols, the shape of `opencode.json`, where a package is cached, and the
> names of the commands below. When something here stops matching what `opencode` does,
> the host has moved and this file is behind — check `opencode --help` and the release
> notes before assuming DPM is broken.

## Installation

Clone the repository somewhere you are happy to keep it, and name the entry file and the
skills directory in your `opencode.json`:

```sh
git clone https://github.com/ninthspace/opencode-dpm.git ~/src/opencode-dpm
```

```json
{
  "plugin": [
    "/absolute/path/to/opencode-dpm/src/plugin/index.ts"
  ],
  "skills": [
    "/absolute/path/to/opencode-dpm/skills"
  ]
}
```

`plugin` registers the MCP server and names an entry **file**. `skills` registers the
twenty-three skills and names a **directory** — the host walks it and reads each
`SKILL.md` itself, taking each skill's name from its own front matter. Both paths are
absolute. The tools and skills appear the next time a session starts; there is nothing to
compile, and upgrading is `git pull`.

**`skills` is last-one-wins, silently.** If a later entry in that array holds a skill
declaring a name DPM also declares, the later one replaces DPM's and **nothing is
logged** — no warning, no diagnostic, and the session looks normal. Every DPM skill
declares a `dpm-`prefixed name precisely so this is unlikely rather than merely unlucky,
but the ordering is yours: keep DPM's entry last if you list several skill directories,
or check `opencode debug skill` if a `dpm-*` skill starts behaving like something else.

**`opencode plugin add github:ninthspace/opencode-dpm` is not the install**, and the reason
is worth a paragraph because the failure it produces is quiet. OpenCode unpacks a plugin
package under `$XDG_CACHE_HOME/opencode/packages/<specifier>/node_modules/opencode-dpm/`,
and **Node refuses to strip types from any `.ts` file underneath a `node_modules`
directory** — on 22 and on 24, with no flag that lifts it. The other runtime on hand is the
bun compiled into the host, which reads TypeScript from anywhere but carries no
`node:sqlite`, which is the one thing DPM's server needs. So from a packaged install there
is no runtime that can start the server. What you get is twenty-three skills registered and
no tools behind them — and since every skill works exclusively through those tools, they
are inert, with nothing in the interface saying so.

A checkout is outside `node_modules`, which is the whole of the difference: Node reads the
sources directly, exactly as it does for the test suite and the pre-commit hook.

## First run

Two steps, in a repository DPM is going to keep planning artefacts in.

**1. Install the pre-commit hook.** It regenerates both artefacts and refuses a commit
that disagrees with the database.

Three commands, from the repository root — one to install it, two to check:

```sh
ln -s ~/src/opencode-dpm/hooks/pre-commit .git/hooks/pre-commit
ls -l .git/hooks/pre-commit
git config core.hooksPath
```

The target is the clone you named in *Installation* — the same tree the plugin loads from,
so the hook and the tools are never two different ages. **The path must be absolute**, and
that is the part worth care rather than the path itself: a symlink's target resolves from
the directory holding the link — `.git/hooks/` — and not from wherever you ran `ln`, so a
path written relative to the repository root lands two levels too deep. `~` expands before
`ln` sees it, which is why the line above is safe as written.

The other two lines are there because every way this goes wrong goes wrong quietly:

- **`ln` says `File exists`.** Git allows exactly one `pre-commit` hook, DPM's ends in
  `exec` and so replaces whatever is there rather than running it, and something is
  already there. Do not reach for `-f`: read [When something else owns the
  hook](#when-something-else-owns-the-hook), which tells the four cases apart.
- **`ls -l` shows no link, or one whose target does not exist.** Git skips a hook it
  cannot resolve without a warning and without failing the commit, so a broken link and no
  link at all look identical from the outside.
- **`git config core.hooksPath` prints a path.** Git then looks only there, and the link
  you just made is inert however correct `ls -l` makes it look. Same section.

**When you keep more than one clone, check what you are linked to.** Upgrading the clone
you linked against is `git pull`, which rewrites it in place and leaves the link working.
Two clones is the case to watch — a release checkout and a working one, say — because then
there are two DPMs of different ages, and a link into the older one is a current database
checked by an older guard. It refuses rather than reporting on a schema it only partly
understands, which is how you find out. Re-linking is the same command with `-f` added:

```sh
ln -sf ~/src/opencode-dpm/hooks/pre-commit .git/hooks/pre-commit
```

**`-f` deletes what it replaces, without asking and without a copy.** That is what you want
when it is DPM's own stale link and never what you want otherwise — so `ls -l` first and
confirm the target is an older DPM, rather than making this the command you always run.

**A stale link announces itself; a missing one never does.** Those are two different
failures and only the first is self-reporting. A link into an older release produces a
refusal that names the release it ran from, so you find out at the next commit. A link that
is *gone* — `.git/hooks/` is not tracked, so it does not survive a re-clone, a fresh
`git init`, or anything that rewrites the directory — produces nothing at all. Git skips a
hook it cannot find without a warning and without failing the commit, so the working state
and the unguarded one are indistinguishable from the outside, and every commit after it goes
in unchecked. Run `ls -l .git/hooks/pre-commit` when you arrive in a repository you have not
committed to for a while; it is the only thing that tells you.

**dpm says so itself, on the one case it can be sure of.** The first tool call of a session
looks for `.git/hooks/pre-commit` on its way to the database, and writes a line to stderr when
there is nothing there — the same channel, and the same terms, as the restore report: unusual,
actionable, silent otherwise. It warns on *absence* and on nothing else. A hook that exists and
is not dpm's may well be dispatching to dpm, and a warning that fired every session on a
correctly configured repository is one you would learn to skip. It also stays quiet outside a
repository, in a linked worktree, and where `core.hooksPath` has moved the hooks directory —
three states where `.git/hooks/` is not the question.

Two shell functions for your `.bashrc` or `.zshrc`, if the rest is a check you would rather
not remember. **They are bash and zsh, not POSIX `sh`** — a hyphen is not allowed in a
function name there, so `sh` rejects `dpm-link` before it runs anything:

```sh
DPM_CLONE=~/src/opencode-dpm

dpm-link() {
    ln -s "$DPM_CLONE/hooks/pre-commit" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
    git config core.hooksPath
}

dpm-relink() {
    ln -sf "$DPM_CLONE/hooks/pre-commit" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
}
```

`DPM_CLONE` is the same path you named in `opencode.json`, written once so the two cannot
drift apart.

`dpm-link` is step 1 with both checks attached, so `File exists` still stops you and sends
you to [When something else owns the hook](#when-something-else-owns-the-hook) rather than
being forced past. `dpm-relink` is the upgrade command, kept separate precisely so that `-f`
is something you reach for deliberately — it prints what it made, which is the confirmation
the target really was an older DPM. Both run from the repository root.

**In a repository that develops DPM itself, the guard is the code you are editing, and
there is no longer an installed release to stand apart from it.** That separation was what
a packaged install bought: the release that wrote `.dpm/dpm.db` was the release that
checked the projection, and a half-written change could not block its own commit. With a
checkout install the two are one tree, so a bug in the guard blocks committing the fix for
that bug — a real cost, paid because no runtime can start the server from a packaged copy.

The way out is to unlink for the length of that one commit — `rm .git/hooks/pre-commit`,
commit, `dpm-link` — rather than to `--no-verify`, which skips the guard silently and
leaves nothing saying it was skipped. Keeping a second, stable clone and linking against
that one restores the old separation if you want it back.

Point the link at a *different* clone only while the *schema* is what you
are editing, and only for as long as that lasts. Then the working tree's guard and the
working tree's publisher agree with each other and neither agrees with the stable clone,
which is what you want while a migration is half-written and want nothing to do with
afterwards. Verify a re-point either way by running `.git/hooks/pre-commit` the way git
does — from the repository root, with no arguments — rather than by invoking `bin/` directly.

The database itself is not committed — `.dpm/dpm.sql` is its committed text form, and it
is what a checkout restores from. That restore is not a step either: on a fresh clone the
first tool call finds no database, finds the dump beside it, builds one from it, and says
so in a line on stderr. A checkout that already has a database keeps it untouched, whatever
the dump holds — replacing one is a merge, and a merge is something you ask for.
Keeping the binary out of the commit is not a step you
perform: the first tool call writes `.dpm/.gitignore` before it creates the database, so
there is no window in which an unignored `dpm.db` can be staged. Commit that file once and
it reaches every clone. If you already have one, DPM leaves it exactly as it is.

**2. Publish before committing.** The markdown under `docs/` is generated, and nothing
generates it as a side effect of writing. After a skill run that changed anything, ask for
the `dpm-publish` skill — "publish", or the skill tool with that id. Then commit — both
the projection and `.dpm/dpm.sql` go in the same commit.

Skip step 2 and the hook refuses the commit; nothing is lost, and nothing is written
behind you. **The hook does not publish for you, and that is deliberate** — one that
regenerated and staged the result would silently overwrite a hand-edit, which is the
failure the guard exists to catch. So the refusal is the reminder, and running the
publish is still yours.

The refusal names `node <dpm clone>/bin/dpm-publish.ts` — the absolute path the guard
itself was loaded from — because it may arrive at a terminal with no session open.
`<dpm clone>` is that checkout, the one you named in `opencode.json`, and it stands for the
same path everywhere below; the refusal prints it in full rather than leaving you to find
it. That is
the same publish without the gate: the `dpm-publish` skill shows you every file it would
remove and asks first, and the binary alone does not. Reach for the skill whenever you are
in a session, which is nearly always.

## Permissions

**None of this is a step.** Under the stock `build` agent DPM works with nothing added:
nothing it does reads outside your project, and its tools are ordinary tools the agent
already allows. What follows is for the case where you have set a restrictive baseline and
DPM has to be let back through it.

There was an entry here that everybody had to add, and it is gone rather than moved — the
paragraph below headed *Nothing DPM does reads outside the project* is what replaced it.

**None of it is about restricting DPM's skills.** The twenty-three are the product — they
are meant to be used, they are how the method is followed at all, and a repository that
denies one has a hole in the method rather than a tightened setup. What follows is an
allow-list and an explanation of what the host's `deny` and `ask` would do if you met one,
because the host offers them and a reader who assumes a skill rule covers DPM's writes
would have configured exactly the wrong half.

**The key is `permission`, singular, and it holds an object.** Each entry is keyed by what
is being done — `skill`, `bash`, `edit`, or a tool's own name — and its value is either a
bare action (`"deny"`, which is shorthand for `{ "*": "deny" }`) or an object of
`pattern: action`. Within one of those objects **insertion order matters**: OpenCode
evaluates the **last** matching pattern, so broad rules go first and narrow ones last. A
per-agent `permission` overrides the top-level one rather than being appended to it.

**`permissions` — plural, an array of `{ action, resource, effect }` — is the shape the
host's next major version takes, and v1 does not merely ignore it.** It refuses the whole
configuration, and the session does not start:

```
Error: Configuration is invalid at /path/to/opencode.json
↳ V2 permissions are not supported by OpenCode V1. Use V1 "permission" rules or run opencode2.
```

That is the one failure in this file that is loud, and it is worth knowing which shape you
are looking at before you copy anything: the two are close enough to read as variants of
each other and only one of them starts.

**Nothing DPM does reads outside the project.** Every skill body opens by asking for the
shared conventions through `dpm_read_shared_document`, an ordinary DPM tool that reads the
document out of the installed package in the server's own process. So there is no
`external_directory` rule to set, and if you carried one over from an earlier version you
can drop it.

This used to be the one entry every user had to add. The bodies named
`shared/skill-conventions.md` as a path in the clone, the host classified that read as
leaving the project, and the stock rules end with
`"external_directory": { "*": "ask" }` — so interactively it
prompted on the first skill of every session, and non-interactively it was rejected and the
skill carried on without the conventions it had been told to read. That last outcome is the
one that mattered: nothing announced it. A tool call has no such failure mode, because a
refused or failed call is one the session sees.

DPM occupies two keys, and telling them apart is the whole of this section:

| What happens | Key | Pattern |
|---|---|---|
| A skill is loaded into the conversation | `skill` | the skill's id — `dpm-spec`, `dpm-publish`, … |
| A DPM tool runs | the tool's own name — `dpm_create_spec`, `dpm_publish`, … | `*` |

**The two fail differently, and the tool half fails quietly.** A denied `skill` refuses at
the point of use and says so, quoting the rule that stopped it. A denied tool is **removed
from the model's tool list before the session starts** — there is no refusal to read,
because there is nothing left to call. `"dpm_*": "deny"` produces a session that reports
having no DPM tools at all rather than one that is told it may not use them, which is why a
tool rule is worth getting right the first time rather than debugging from the inside.

**The id a `skill` rule matches against is the `name` in that skill's front matter** — not
its directory, and not anything DPM composes while registering it. Each of the twenty-three
declares its own `dpm-` prefix at the top of `skills/dpm-<skill>/SKILL.md`, so the string
the host registers is the string you can read out of the file, and one `dpm-*` covers all
twenty-three. That is worth knowing rather than taking on trust: a prefix applied at
registration would leave the file saying one thing and the permission engine matching
another, which is what a rule that silently matches nothing looks like from the outside.

**If you have set a restrictive baseline**, these two entries are the minimum that lets
DPM work:

```json
{
  "permission": {
    "skill": { "dpm-*": "allow" },
    "dpm_*": "allow"
  }
}
```

**If you want a confirmation before anything is removed**, put it on the tool and not on
the skill. Publish is the only DPM operation that deletes a file:

```json
{
  "permission": {
    "dpm_publish": "ask"
  }
}
```

`dpm_publish` is what writes the projection and unlinks the generated files no document
produces any more, so it is the line the removal actually passes through. The skill rule —
`"skill": { "dpm-publish": "ask" }` — governs something else entirely:
whether the *procedure* is loaded into the conversation. Gating that gets you a
confirmation for reading a set of instructions and none at all for the deletion, which is
the wrong half of the pair and reads like the right one. The `dpm-publish` skill already shows you
every file it would remove and asks first; the rule above is for the tool being called
without it.

If you do meet a `deny` on a skill — an inherited config, a restricted agent — it is
honest about what it stops. The host checks before it reads the file, so the instructions
never enter the conversation, and there is no second route to them: each skill registers
under exactly one id, no tool returns skill text, and the package puts no executables on
your `PATH`. A skill that cross-references a denied one sends the model back through the
same tool, which refuses again. What it does **not** stop is DPM's tools, which are
separate keys — so a denied skill is a method nobody can follow, not a repository
nothing can write to. `ask` is a question rather than a slower deny: answer it and the
skill loads normally.

The refusal quotes the ruleset that produced it, which is what tells you a `dpm-*` pattern
matched rather than something broader:

```
The user has specified a rule which prevents you from using this specific tool call.
Here are some of the relevant rules [{"permission":"skill","pattern":"dpm-*","action":"deny"}]
```

## When something else owns the hook

DPM's hook ends in `exec` — it hands the process to the guard and never returns, so it
runs *instead of* whatever was at `.git/hooks/pre-commit`, not before it. Git has no
notion of a second hook at the same path. Four cases, and the check in step 1 tells them
apart.

**`ls` showed a symlink into an older DPM.** The stale-link case, and the only one where
overwriting is correct — the install command from step 1, with `-f`:

```sh
ln -sf ~/src/opencode-dpm/hooks/pre-commit .git/hooks/pre-commit
```

**`git config core.hooksPath` printed a path.** Something — husky, lefthook, or the
`pre-commit` framework — has moved the hooks directory, and git now looks *only* there.
This is the case worth knowing about, because installing DPM's link anyway works
perfectly and does nothing: the file is created, `ls -l` shows it correct, and git never
invokes it. Put DPM's hook inside whatever owns that directory instead, using that tool's
own mechanism, or unset the setting if you no longer use it:

```sh
git config --unset core.hooksPath
```

**You use the `pre-commit` framework** (the Python one — the name collision is
unfortunate). It owns `.git/hooks/pre-commit` and dispatches from
`.pre-commit-config.yaml`, so overwriting it disables every other check in the
repository. Register DPM as a local hook instead:

```yaml
repos:
  - repo: local
    hooks:
      - id: dpm-guard
        name: DPM projection guard
        entry: <dpm clone>/hooks/pre-commit
        language: system
        pass_filenames: false
```

**`ls` showed a hook of your own, or another tool's.** Keep it and run both, in a wrapper
you own. Move the incumbent aside, then write a hook that calls each in turn:

```sh
mv .git/hooks/pre-commit .git/hooks/pre-commit.local
cat > .git/hooks/pre-commit <<'SH'
#!/bin/sh
set -e
.git/hooks/pre-commit.local
exec <dpm clone>/hooks/pre-commit
SH
chmod +x .git/hooks/pre-commit
```

**Order matters, and DPM's goes last.** `set -e` stops at the first failure, and DPM's
guard is the one whose refusal has a specific fix attached — reaching it after your own
checks have passed means the message you are reading is about the thing you still have
to do. It stays `exec` so the guard's exit status is the hook's.

In both, `<dpm clone>` is what it is everywhere else in this file: the checkout you named in
`opencode.json`, which is the same path step 1's `ln` uses.

The wrapper is a real file rather than a symlink, so nothing re-points it — but nothing
re-points a symlink either, and here the path is spelled out rather than resolved. It goes
stale in the one case step 1's does: you moved the clone, or started linking against a
different one. Re-edit the hook, in a place the check in step 1 will not find for you.

## When the guard refuses

The database and `.dpm/dpm.sql` are two forms of the same thing, and they can fall out of
step in three different ways. The guard says which one happened and names the fix — but
each of these is a real command you can run at any time, not only when a commit is
refused, and each discards whatever is only on the side it overwrites. Knowing which is
which before you are standing in front of a refusal is the point of this section.

There is a fourth refusal that is not about the two artefacts at all — the guard
reporting that it is itself out of date. It has its own section below, because its fix is
not one of these commands.

**The database moved.** You changed something and did not publish. Regenerate both
artefacts:

```sh
node <dpm clone>/bin/dpm-publish.ts
```

or invoke the skill tool with id `dpm-publish` if you are already in a session — which is
the wording the refusal itself uses. This is step 2 above, and it is the common case.

**The dump moved.** You pulled. `.dpm/dpm.sql` arrived rewritten and your database is
behind it. Rebuild the database from the dump:

```sh
node <dpm clone>/bin/dpm-import.ts
```

Publishing here would do the opposite of what you want — it regenerates the dump from a
database that is behind it, and everything the pull brought would be gone.

**Both moved.** You pulled onto work you had not published. Neither can be regenerated
from the other without losing whatever is only on the side being overwritten, so the two
have to be reconciled:

```sh
node <dpm clone>/bin/dpm-merge.ts
```

Run it during the conflicted `git merge`, from the repository root. It reads git's three
stages of `.dpm/dpm.sql`, merges them row by row, and rebuilds the database from the
result. Where it cannot decide, it stops and says which rows are in question rather than
picking one. Git does not invoke it for you; registering it as a merge driver needs
per-clone configuration and is not something DPM does on your behalf.

## When the guard is out of date

Nothing is out of step here; the hook is. DPM upgraded, the database is at a schema
version this guard has never heard of, and `.git/hooks/pre-commit` is still symlinked into
an older clone. `git pull` in the clone you linked against rewrites it in place and the
link keeps working — what leaves two DPMs of different ages is a *second* clone, with the
link pointing into the one you did not pull.

The fix is to re-make the link against the clone you are actually running: the `ln -s` from
step 1. The refusal names the directory it ran from, which is the old one's, so the path
you are replacing is in the message.

It refuses rather than carrying on for the reason the migrator leaves a newer database
alone. This guard's picture of the schema is missing whatever the release added, so what
it would produce is a comparison against part of a database — and the outcome of that is
very often a pass, which is the one verdict nobody investigates. Until the link is
re-made, no commit in that repository has been checked by anything.

## Coming from CPM

**Migrate under Claude Code first, then come here.** The CPM migration guide belongs to
DPM's Claude Code release and is maintained there; this package does not carry a copy,
because a second copy is a second thing to keep current and the move it describes happens
while CPM is still installed — which is not this host. Install DPM under Claude Code, work
through its `MIGRATION.md`, and install this once your repository is a DPM repository.

What follows is the one part of that guide you should not put off even if you do nothing
else, because it is what DPM will delete if you skip it.

**There is no importer, and that is a decision rather than a gap** (AD8). DPM never reads a
CPM `docs/` tree. New and existing projects alike begin with a blank database, so a project
adopting DPM carries none of its history across — the artefacts stay exactly where they are,
as CPM's files, and DPM neither converts nor repairs them.

**But DPM will offer to delete some of them, so move them out of the way first.** The
projection reclaims a file it did not write when the name carries one of DPM's *own kind names*
in the position the renderer puts it — `-spec-`, `-epic-`, and so on — inside the directory that
kind is mapped to. Whether that catches a given CPM directory comes down to whether the two
systems happen to use the same word for the same kind of document: `spec` and `spec` collide,
`plan` and `problem_brief` do not.

**Move all twelve regardless.** The ones that are safe are safe by coincidence of vocabulary,
and renaming a single kind in a later version moves a directory from one column to the other
with nothing to announce it. Sorting them is work that has to be redone every release, and
being wrong costs files.

Only those twelve are walked, and only one level deep, so `docs/cpm/` is permanently out of
reach and stays readable:

```sh
mkdir -p docs/cpm
git mv docs/plans docs/briefs docs/specifications docs/epics docs/retros docs/quick \
       docs/discussions docs/communications docs/reviews docs/audits docs/runbooks \
       docs/library docs/cpm/   # drop any you do not have
```

`docs/architecture/` is not on that list because it is never walked at all: DPM renders an ADR
inside the document that raised it and has no directory for the kind. Leave your ADRs where
they are.

A walked directory is still safe for files the rule cannot mistake for its own: a hand-kept
`docs/epics/README.md` is never a candidate.

**Preview before the first publish either way.** The `dpm-publish` skill lists every removal
and asks before it removes anything. `bin/dpm-publish.ts` does not — it is the non-interactive
form, and it is the command the pre-commit guard names when the refusal is a database that has
moved ahead of its dump. The other two refusals name other fixes; see [When the guard
refuses](#when-the-guard-refuses). In a repository with a CPM corpus still in place, reach for
the skill.

Once the corpus is out of reach, the other half — which of it, if any, is worth carrying over,
and which is finished work no DPM skill will ever read — is the conversation the Claude Code
guide walks you through.

## Status

**Beta, and young — but not new.** This package is a standalone fork of DPM 0.7.0. The
method, the schema, the 183 tools and the 23 skills are DPM's and have been in use for some
time; what is new is the host binding, and that is the part still settling.

**Two specifications are built out here, and the second changed the first one's answer.**
The fork was written against the OpenCode beta, because that was the release on hand. The
second specification moved it onto the 1.x line, and the host turned out to differ in ways
that reached well past the registrar: the skills registered through a configuration key
rather than a plugin, a clone rather than a packaged install, and the shared conventions
served by a tool rather than rewritten into skill bodies as they were registered.
The epics are in `docs/epics/`:

| Epic | What it delivered |
|---|---|
| `01-01-epic-repo-bootstrap.md` | The standalone repository and the JavaScript-to-TypeScript conversion, checked byte-for-byte against a dump v0.7.0 wrote |
| `01-02-epic-plugin-entry.md` | The plugin entry, one MCP server and 183 `dpm_` tools |
| `01-03-epic-skill-port.md` | All twenty-three skill bodies off Claude Code's tool prefix and slash commands, with the prohibition enforced in CI |
| `01-04-epic-guard-and-docs.md` | The pre-commit guard at OpenCode's hook path, this README, and permission behaviour |
| `01-05-epic-publish.md` | What the package ships, and the restrictions it holds to in production |
| `02-01-epic-v1-registrar.md` | The move to the supported host: the plugin entry for its MCP registry, and the clone install that replaced the packaged one |
| `02-02-epic-skill-identity.md` | The `dpm-` prefix moved into each skill's own front matter, which is where both the skill registry and the permission engine read it |
| `02-03-epic-shared-documents.md` | The shared conventions served by `dpm_read_shared_document`, so no host hook has to rewrite a skill body |
| `02-04-epic-two-host-docs.md` | This README and the permission guidance, brought onto the one host DPM supports |
| `02-05-epic-v1-walk.md` | **Not delivered yet** — starting a skill in a real session and following it through to a commit the guard accepts |

**What is not settled at 0.1.0.** Three things are on the record as unfinished rather than
unknown. Starting a skill and following it through has not been watched inside a real
session — the registry is verified, the walk is assumed, and the last epic in the table is
where that gets answered rather than restated. `ralph` is registered like the other
twenty-two, but the loop it describes rests on a Claude Code stop hook that OpenCode has no
equivalent for, so that loop does not run. And DPM's database path is relative, which means
the working directory OpenCode hands a spawned MCP server is what decides which repository
`.dpm/` lands in.

## Licence

MIT
