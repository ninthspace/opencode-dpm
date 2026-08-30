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
- **One install per specifier, and the link follows the specifier.** OpenCode names a
  package directory for a digest of the specifier you typed, so upgrading the one you
  linked against rewrites that directory and the symlink keeps working. Two specifiers for
  the same repository — a tag and a branch — are two installs of different ages, and that
  is what leaves a link pointing at the older one. A *stale* link refuses and tells you; a
  *missing* one is silent, and `.git/hooks/` is not tracked — so `ls -l
  .git/hooks/pre-commit` is worth running when you come back to a repository.
- **A refused commit is telling you which of four things happened**, and each has a
  different fix — publishing when you should have imported destroys what you pulled. The
  refusal names the command; *When the guard refuses* explains the choice.
- **OpenCode v2 is a beta.** DPM is built against it, and where the host moves, DPM
  follows — see *Requirements*.

## Requirements

- **OpenCode v2**, run as `opencode2`. DPM is an OpenCode plugin: it registers one MCP
  server and twenty-three skills, and there is no other host it runs under.
- **Node 24 or later.** DPM uses `node:sqlite` from the standard library and runs its own
  TypeScript by Node's native type-stripping, so there is no native module, no `node-gyp`,
  no loader and no build step — but both of those need 24. Below the floor, each of DPM's
  five executables refuses with a message naming the version you have and the version it
  needs, rather than failing on an unknown builtin or a syntax error in a type annotation.

> **OpenCode v2 is a beta, and DPM is built against a moving target.** Entrypoints may
> move under it: the plugin API, the shape of `opencode.json`, where a package is cached,
> and the names of the commands below are all things the host is still free to change.
> When something here stops matching what `opencode2` does, the host has moved and this
> file is behind — check `opencode2 --help` and the release notes before assuming DPM is
> broken.

## Installation

```sh
opencode2 plugin add github:ninthspace/opencode-dpm
```

That adds the specifier to your `opencode.json` and fetches the package into OpenCode's
cache. The tools and skills are registered the next time a session loads plugins; there is
nothing to compile.

**The specifier you type is the identity of the install**, and it is worth typing the one
you mean to keep. OpenCode names the package directory for a digest of the string, so
`github:ninthspace/opencode-dpm` and `github:ninthspace/opencode-dpm#main` are two
installs of the same repository, cached separately and upgraded separately. That matters
for exactly one thing — which of them your pre-commit hook is symlinked into — and *First
run* covers it.

The same mechanic is how you pin. Append `#` and any git ref — a tag, a branch, a commit —
and you get that tree rather than whatever `main` currently holds:
`github:ninthspace/opencode-dpm#v0.1.0`. Without a ref you track `main`, which is the right
default for a beta and the wrong one if you want a version you can go back to. There is no
npm package; a tag is the release.

To work on DPM itself, point the config at your clone instead of a specifier, so the
plugin loads from your working tree:

```json
{
  "plugins": [
    { "package": "/absolute/path/to/opencode-dpm/src/plugin/index.ts" }
  ]
}
```

The `package` names the entry *file*, not the directory.

## First run

Two steps, in a repository DPM is going to keep planning artefacts in.

**1. Install the pre-commit hook.** It regenerates both artefacts and refuses a commit
that disagrees with the database.

Three commands, from the repository root — one to install it, two to check:

```sh
ln -s "$(ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1)" .git/hooks/pre-commit
ls -l .git/hooks/pre-commit
git config core.hooksPath
```

The first line finds the most recently installed DPM and links it, so there is no plugin
path to look up and none to type. `opencode2 plugin add` puts a package under
`$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/opencode-dpm/`, where `<hash>`
is a digest of the specifier you typed rather than a version — so the glob is over the
hashes and the sort is by *time*, which is the one ordering that means anything here. What
it produces is an *absolute* path, which is the part that matters: a symlink's target
resolves from the directory holding the link — `.git/hooks/` — and not from wherever you
ran `ln`, so a path written relative to the repository root lands two levels too deep.
Running DPM from a clone rather than an installed plugin, it is the same command with the
path spelled out:

```sh
ln -s ~/src/opencode-dpm/hooks/pre-commit .git/hooks/pre-commit
```

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

**When you have more than one DPM installed, check what you are linked to.** The package
directory is named for the specifier you typed, so upgrading *that* specifier rewrites the
directory in place and the link you already have keeps working. Two specifiers is the case
to watch — a tag and a branch, say — because then there are two installs of different ages
and a link into the older one is a current database checked by an older guard. It refuses
rather than reporting on a schema it only partly understands, which is how you find out.
Re-linking is the same command with `-f` added:

```sh
ln -sf "$(ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1)" .git/hooks/pre-commit
```

**`-f` deletes what it replaces, without asking and without a copy.** That is what you want
when it is DPM's own stale link and never what you want otherwise — so `ls -l` first and
confirm the target is an older DPM, rather than making this the command you always run.

Both forms glob across every package OpenCode has cached and take the most recently written.
That is a guess, and a good one exactly once: when there is one DPM install, or when the one
you just upgraded is the one you want. With two specifiers in play it can pick the wrong one,
and `ls -l` is what tells you — so if you keep a tag and a branch installed side by side,
spell the path out rather than letting the glob choose.

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
dpm-link() {
    ln -s "$(ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1)" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
    git config core.hooksPath
}

dpm-relink() {
    ln -sf "$(ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1)" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
}
```

`dpm-link` is step 1 with both checks attached, so `File exists` still stops you and sends
you to [When something else owns the hook](#when-something-else-owns-the-hook) rather than
being forced past. `dpm-relink` is the upgrade command, kept separate precisely so that `-f`
is something you reach for deliberately — it prints what it made, which is the confirmation
the target really was an older DPM. Both run from the repository root.

**Neither belongs in a repository that develops DPM itself.** They link into the installed
package, which holds whatever commit the specifier last resolved to; a checkout that is
*editing the schema* needs a guard from the same checkout, or the guard goes stale against a
schema three directories away. Link that one at the working tree instead.

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

The refusal names `node <package path>/bin/dpm-publish.ts` — the absolute path the guard
itself was loaded from — because it may arrive at a terminal with no session open. That is
the same publish without the gate: the `dpm-publish` skill shows you every file it would
remove and asks first, and the binary alone does not. Reach for the skill whenever you are
in a session, which is nearly always.

## Permissions

Nothing here is a step. Under the stock `build` agent every rule below is already the
answer, and DPM works with no permission configuration at all. The section is for the case
where that stops being true: you have set a restrictive baseline, and DPM has to be let
back through it.

**None of it is about restricting DPM's skills.** The twenty-three are the product — they
are meant to be used, they are how the method is followed at all, and a repository that
denies one has a hole in the method rather than a tightened setup. What follows is an
allow-list and an explanation of what the host's `deny` and `ask` would do if you met one,
because the host offers them and a reader who assumes a skill rule covers DPM's writes
would have configured exactly the wrong half.

OpenCode evaluates one rule per **action** and **resource**. Rules live in an array, the
**last** one that matches both wins, and a request that matches nothing defaults to `ask`.
Entries in your `opencode.json` are appended to every agent's own rules, which is why they
override the agent's defaults rather than being overridden by them.

DPM occupies two actions, and telling them apart is the whole of this section:

| What happens | Action | Resource |
|---|---|---|
| A skill is loaded into the conversation | `skill` | the skill's id — `dpm-spec`, `dpm-publish`, … |
| A DPM tool runs | the tool's own name — `dpm_create_spec`, `dpm_publish`, … | `*` |

**If you have set a restrictive baseline**, these two entries are the minimum that lets
DPM work:

```json
{
  "permissions": [
    { "action": "skill", "resource": "dpm-*", "effect": "allow" },
    { "action": "dpm_*", "resource": "*", "effect": "allow" }
  ]
}
```

**If you want a confirmation before anything is removed**, put it on the tool and not on
the skill. Publish is the only DPM operation that deletes a file:

```json
{
  "permissions": [
    { "action": "dpm_publish", "resource": "*", "effect": "ask" }
  ]
}
```

`dpm_publish` is what writes the projection and unlinks the generated files no document
produces any more, so it is the line the removal actually passes through. The skill rule —
`{ "action": "skill", "resource": "dpm-publish" }` — governs something else entirely:
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
separate actions — so a denied skill is a method nobody can follow, not a repository
nothing can write to. `ask` is a question rather than a slower deny: answer it and the
skill loads normally.

## When something else owns the hook

DPM's hook ends in `exec` — it hands the process to the guard and never returns, so it
runs *instead of* whatever was at `.git/hooks/pre-commit`, not before it. Git has no
notion of a second hook at the same path. Four cases, and the check in step 1 tells them
apart.

**`ls` showed a symlink into an older DPM.** The stale-link case, and the only one where
overwriting is correct — the install command from step 1, with `-f`:

```sh
ln -sf "$(ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1)" .git/hooks/pre-commit
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
        entry: <package path>/hooks/pre-commit
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
exec <package path>/hooks/pre-commit
SH
chmod +x .git/hooks/pre-commit
```

**Order matters, and DPM's goes last.** `set -e` stops at the first failure, and DPM's
guard is the one whose refusal has a specific fix attached — reaching it after your own
checks have passed means the message you are reading is about the thing you still have
to do. It stays `exec` so the guard's exit status is the hook's.

In both, `<package path>` is the directory the install landed in — the one step 1's `ln`
resolves for you:

```sh
ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm | head -1
```

The wrapper is a real file rather than a symlink, so nothing re-points it — but nothing
re-points a symlink either, and here the path is spelled out rather than resolved. It goes
stale in the one case step 1's does: you installed a second specifier for the same
repository and the newer install is somewhere else. Re-run the line above and re-edit the
hook, in a place the check in step 1 will not find for you.

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
node <package path>/bin/dpm-publish.ts
```

or invoke the skill tool with id `dpm-publish` if you are already in a session — which is
the wording the refusal itself uses. This is step 2 above, and it is the common case.

**The dump moved.** You pulled. `.dpm/dpm.sql` arrived rewritten and your database is
behind it. Rebuild the database from the dump:

```sh
node <package path>/bin/dpm-import.ts
```

Publishing here would do the opposite of what you want — it regenerates the dump from a
database that is behind it, and everything the pull brought would be gone.

**Both moved.** You pulled onto work you had not published. Neither can be regenerated
from the other without losing whatever is only on the side being overwritten, so the two
have to be reconciled:

```sh
node <package path>/bin/dpm-merge.ts
```

Run it during the conflicted `git merge`, from the repository root. It reads git's three
stages of `.dpm/dpm.sql`, merges them row by row, and rebuilds the database from the
result. Where it cannot decide, it stops and says which rows are in question rather than
picking one. Git does not invoke it for you; registering it as a merge driver needs
per-clone configuration and is not something DPM does on your behalf.

## When the guard is out of date

Nothing is out of step here; the hook is. DPM upgraded, the database is at a schema
version this guard has never heard of, and `.git/hooks/pre-commit` is still symlinked
into an older install. A package directory is named for the specifier it came from, so
upgrading the specifier you linked against rewrites that directory and the link keeps
working — what leaves two installs of different ages is two specifiers for the same
repository, a tag and a branch say, with the link pointing into the older one.

The fix is to re-make the link against the current package path: the `ln -s` from step 1.
The refusal names the directory it ran from, which is the old install's, so the path you
are replacing is in the message.

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

In use, still settling. Three specs are built out, each across the epics sharing its
number in `docs/epics/`:

| Spec | What it delivered |
|---|---|
| `47-spec-dpm-sqlite-persistence.md` | The schema, the tool surface, the skill corpus, the projection and the pre-commit guard |
| `48-spec-dpm-board.md` | The cross-project board, which this package does not carry |
| `49-spec-dpm-database-lifecycle.md` | Deferred creation, the automatic ignore file, restore-from-dump, and a guard that names the fix by direction |

## Licence

MIT
