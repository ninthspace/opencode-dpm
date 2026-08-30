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
  **absolute** target), and run `/dpm:publish` before committing. Both are under *First
  run*.
- **Re-make that symlink after every DPM upgrade.** Releases install side by side and
  re-point nothing, so the link keeps running the release you installed it from. A *stale*
  link refuses and tells you; a *missing* one is silent, and `.git/hooks/` is not tracked —
  so `ls -l .git/hooks/pre-commit` is worth running when you come back to a repository.
- **A refused commit is telling you which of four things happened**, and each has a
  different fix — publishing when you should have imported destroys what you pulled. The
  refusal names the command; *When the guard refuses* explains the choice.
- **Coming from CPM?** Read **[MIGRATION.md](MIGRATION.md)** before you run anything —
  there is one move to make first, and it is easier while CPM is still installed.

## Requirements

- **Node 22.5.0 or later.** DPM uses `node:sqlite` from the standard library, so there is
  no native module, no `node-gyp`, and no build step at install time. Below the floor,
  each of DPM's five executables refuses with a message naming the version rather than
  failing on a missing module.

## Installation

Inside Claude Code:

```
/plugin marketplace add ninthspace/claude-code-marketplace
/plugin install dpm@ninthspace-marketplace
```

The suffix is the marketplace's name rather than the repository's — they differ, and only
the former resolves.

To work on DPM itself, clone the repository and add the clone as a marketplace instead, so
the plugin points at your working tree rather than a cached copy:

```sh
git clone git@github.com:ninthspace/claude-code-marketplace.git
```

then `/plugin marketplace add <path to the clone>`.

Installing registers the MCP server, so the tools and skills are available immediately.
There is nothing to compile either way.

> **Already using CPM in this repository? Stop here and read
> [MIGRATION.md](MIGRATION.md).** DPM's first publish will offer to delete files it did
> not write, and the move that puts your CPM corpus out of its reach has to happen
> before then. The guide also covers what is worth carrying across — which is a
> conversation best had while CPM is still installed, because it is the one moment you
> have both systems to hand.

## First run

Two steps, in a repository DPM is going to keep planning artefacts in.

**1. Install the pre-commit hook.** It regenerates both artefacts and refuses a commit
that disagrees with the database.

Three commands, from the repository root — one to install it, two to check:

```sh
ln -s "$(ls -d ~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1)" .git/hooks/pre-commit
ls -l .git/hooks/pre-commit
git config core.hooksPath
```

The first line finds the newest installed DPM and links it, so there is no plugin path to
look up and none to type. What it produces is an *absolute* path, which is the part that
matters: a symlink's target resolves from the directory holding the link — `.git/hooks/` —
and not from wherever you ran `ln`, so a path written relative to the repository root lands
two levels too deep. Running DPM from a clone rather than an installed plugin, it is the
same command with the path spelled out:

```sh
ln -s ~/src/claude-code-marketplace/dpm/hooks/pre-commit .git/hooks/pre-commit
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

**Re-run it after every upgrade, with `-f` added.** An installed plugin lives at
`…/plugins/cache/<marketplace>/dpm/<version>/`, an upgrade installs beside the old version
rather than replacing it, and nothing re-points a link into the one you linked against — so
the ordinary state after upgrading is a current database checked by the previous release's
guard. It refuses rather than reporting on a schema it only partly understands, which is
how you find out:

```sh
ln -sf "$(ls -d ~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1)" .git/hooks/pre-commit
```

**`-f` deletes what it replaces, without asking and without a copy.** That is what you want
when it is DPM's own stale link and never what you want otherwise — so `ls -l` first and
confirm the target is an older DPM, rather than making this the command you always run.

Both forms glob across marketplaces, and pick the highest version number of everything they
find. If DPM ever reaches you from two marketplaces at once, that is the one case where the
path is worth spelling out.

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

Two shell functions, if the rest is a check you would rather not remember:

```sh
dpm-link() {
    ln -s "$(ls -d ~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1)" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
    git config core.hooksPath
}

dpm-relink() {
    ln -sf "$(ls -d ~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1)" .git/hooks/pre-commit
    ls -l .git/hooks/pre-commit
}
```

`dpm-link` is step 1 with both checks attached, so `File exists` still stops you and sends
you to [When something else owns the hook](#when-something-else-owns-the-hook) rather than
being forced past. `dpm-relink` is the upgrade command, kept separate precisely so that `-f`
is something you reach for deliberately — it prints what it made, which is the confirmation
the target really was an older DPM. Both run from the repository root.

**Neither belongs in a repository that develops DPM itself.** They link into the installed
plugin, which carries a version; a checkout that is *editing the schema* needs a guard from
the same checkout, or the guard goes stale against a schema three directories away. Link
that one at the working tree instead.

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
generates it as a side effect of writing. After a skill run that changed anything, run
`/dpm:publish`. Then commit — both the projection and `.dpm/dpm.sql` go in the same
commit.

Skip step 2 and the hook refuses the commit; nothing is lost, and nothing is written
behind you. **The hook does not publish for you, and that is deliberate** — one that
regenerated and staged the result would silently overwrite a hand-edit, which is the
failure the guard exists to catch. So the refusal is the reminder, and running the
publish is still yours.

The refusal names `node <plugin path>/dpm/bin/dpm-publish.ts`, because it may arrive at a
terminal with no session open. That is the same publish without the gate: `/dpm:publish`
shows you every file it would remove and asks first, and the binary alone does not. Reach
for the skill whenever you are in a session, which is nearly always.

## When something else owns the hook

DPM's hook ends in `exec` — it hands the process to the guard and never returns, so it
runs *instead of* whatever was at `.git/hooks/pre-commit`, not before it. Git has no
notion of a second hook at the same path. Four cases, and the check in step 1 tells them
apart.

**`ls` showed a symlink into an older DPM.** The upgrade case, and the only one where
overwriting is correct — the install command from step 1, with `-f`:

```sh
ln -sf "$(ls -d ~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1)" .git/hooks/pre-commit
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
        entry: <plugin path>/dpm/hooks/pre-commit
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
exec <plugin path>/dpm/hooks/pre-commit
SH
chmod +x .git/hooks/pre-commit
```

**Order matters, and DPM's goes last.** `set -e` stops at the first failure, and DPM's
guard is the one whose refusal has a specific fix attached — reaching it after your own
checks have passed means the message you are reading is about the thing you still have
to do. It stays `exec` so the guard's exit status is the hook's.

The wrapper is a real file rather than a symlink, so it does not go stale on an upgrade
the way a link into a versioned plugin path does — but the `<plugin path>` inside it
does. Re-edit that line when you upgrade; it is the same obligation as re-making the
symlink, in a place the check in step 1 will not find for you.

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
node <plugin path>/dpm/bin/dpm-publish.ts
```

or `/dpm:publish` if you are already in a session. This is step 2 above, and it is the
common case.

**The dump moved.** You pulled. `.dpm/dpm.sql` arrived rewritten and your database is
behind it. Rebuild the database from the dump:

```sh
node <plugin path>/dpm/bin/dpm-import.ts
```

Publishing here would do the opposite of what you want — it regenerates the dump from a
database that is behind it, and everything the pull brought would be gone.

**Both moved.** You pulled onto work you had not published. Neither can be regenerated
from the other without losing whatever is only on the side being overwritten, so the two
have to be reconciled:

```sh
node <plugin path>/dpm/bin/dpm-merge.ts
```

Run it during the conflicted `git merge`, from the repository root. It reads git's three
stages of `.dpm/dpm.sql`, merges them row by row, and rebuilds the database from the
result. Where it cannot decide, it stops and says which rows are in question rather than
picking one. Git does not invoke it for you; registering it as a merge driver needs
per-clone configuration and is not something DPM does on your behalf.

## When the guard is out of date

Nothing is out of step here; the hook is. DPM upgraded, the database is at a schema
version this guard has never heard of, and `.git/hooks/pre-commit` is still symlinked
into the previous release — an upgrade installs beside the old version rather than over
it, and re-points nothing.

The fix is to re-make the link against the current plugin path: the `ln -s` from step 1.
The refusal names the directory it ran from, which is the old release's, so the path you
are replacing is in the message.

It refuses rather than carrying on for the reason the migrator leaves a newer database
alone. This guard's picture of the schema is missing whatever the release added, so what
it would produce is a comparison against part of a database — and the outcome of that is
very often a pass, which is the one verdict nobody investigates. Until the link is
re-made, no commit in that repository has been checked by anything.

## The board

`dpm/tools/board/` is a cross-project terminal UI: every project you register, the
state of its epics and stories, and a keypress that launches the right `/dpm:*`
session for the row you are looking at. There is no install step — it is a PEP 723
single-file script, and `uv` provisions it on first run.

```sh
uv run <plugin path>/dpm/tools/board/board.py add .
uv run <plugin path>/dpm/tools/board/board.py
```

It reads through the same MCP tools the skills do, which is what makes its answers
exact rather than inferred: a blocked epic names its blocker from a `dependency` row.
Two of its views ask questions a markdown corpus cannot be asked at all — `Ctrl+G`
lists every requirement no coverage row traces, and a per-project badge carries what
`check_integrity` found. It spawns servers read-only and writes nothing anywhere
except its own registry and cache under the XDG config directory, so a project it is
pointed at is left byte-identical — including one with no database, which it declines
to spawn against rather than creating one.

See [tools/board/README.md](tools/board/README.md) for the columns, the keys, and the
per-project states.

## Coming from CPM

**The full guide is [MIGRATION.md](MIGRATION.md), and it can be run for you**: paste its
URL into `/cpm:consult` while CPM is still installed and you get a conversation that
already knows what is worth carrying and can see which of it your repository has. This
section is the one part you should not put off — what DPM will delete if you do.

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

**Preview before the first publish either way.** `/dpm:publish` lists every removal and asks
before it removes anything. `bin/dpm-publish.ts` does not — it is the non-interactive form,
and it is the command the pre-commit guard names when the refusal is a database that has moved
ahead of its dump. The other two refusals name other fixes; see [When the guard
refuses](#when-the-guard-refuses). In a repository with a CPM corpus still in place, reach for
the skill.

Once the corpus is out of reach, [MIGRATION.md](MIGRATION.md) covers the other half: which of
it, if any, is worth carrying over, and which is finished work that no DPM skill will ever read.

## Status

In use, still settling. Three specs are built out, each across the epics sharing its
number in `docs/epics/`:

| Spec | What it delivered |
|---|---|
| `47-spec-dpm-sqlite-persistence.md` | The schema, the tool surface, the skill corpus, the projection and the pre-commit guard |
| `48-spec-dpm-board.md` | The cross-project board — see [The board](#the-board) |
| `49-spec-dpm-database-lifecycle.md` | Deferred creation, the automatic ignore file, restore-from-dump, and a guard that names the fix by direction |

## Licence

MIT
