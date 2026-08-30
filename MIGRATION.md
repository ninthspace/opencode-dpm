# Moving to DPM from CPM

DPM keeps planning work as data rather than as files. That is the whole reason this guide exists:
your CPM planning documents are prose, and DPM cannot read prose — not because nobody got round to
writing an importer, but because reading prose is the thing DPM was built to stop doing.

So there is no "migrate" command, and there is not going to be one. What there is instead is a short
list of things worth carrying over by hand, and a much longer list of things you should leave exactly
where they are.

Everything below is done by asking Claude, in a normal conversation, in a project where DPM is
installed. You will not need to know anything about how DPM stores things.

---

## If you would rather be walked through it

CPM can read this guide and run the migration with you, which is worth doing while CPM is still
installed — it is the one moment you have both systems to hand. In the repository you are moving:

```
/cpm:consult bella, please read https://github.com/ninthspace/claude-code-marketplace/blob/main/dpm/MIGRATION.md so we can move from cpm to dpm in this repo and help me migrate
```

One line, however it wraps on screen — a slash command submits at the first newline, so a
paste broken across lines sends only the first part of it.

That gets you a conversation that already knows what the four things worth carrying are, and can
see which of them your repository actually has. The rest of this document is the same migration
done by reading; you do not need both.

**Expect it to start using DPM's own tools, and let it.** You began in a CPM skill, but if DPM is
installed its MCP tools are available in that same session, and writing your library documents and
decisions through them is how they end up as rows rather than as more prose. A CPM session reaching
for DPM's tools looks like it has wandered off; it has not, and it is the only way this conversation
can finish the job. What matters is which system the work lands in, not which one you typed to.

Two things stay yours either way. The `git mv` in the next section is a decision about your files,
so make it yourself rather than delegating it, and **what is still true is a judgement nothing can
make for you** — that is the whole reason there is no import command.

---

## TL;DR

- **Do this first, before running anything**: `git mv` all twelve `docs/` folders DPM generates
  into `docs/cpm/`. DPM regenerates those folders and tidies up files in them it takes for its
  own leftovers, and a good number of CPM documents qualify. Move all twelve, not the ones that
  look risky.
- **That step alone is a complete migration.** DPM works from here. Everything after it is a head
  start rather than a requirement.
- **There is no import command and there will not be one.** Not reading prose is the thing DPM was
  built to do; the judgement about what is still true is yours, one document at a time.
- **Four things are worth carrying**, in this order: constraints on anything still in flight, your
  library documents, lessons that never got promoted, and ADRs still in force. If you do one, do
  the library documents — every skill reads them, every time.
- **A library document without `scope:` imports cleanly and is read by nothing.** This is the
  usual way a migration ends up half-done.
- **Check it by running `/dpm:spec`** and reading the first few lines back. It should name your
  decisions and library documents. Don't count things.
- **Expect less to carry across than feels right** — perhaps four documents, a handful of lessons,
  and however many of your decisions are still in force. The rest stays in `docs/cpm/`, in git,
  readable whenever you ask.
- **`docs/architecture/` does not move.** DPM never looks there — an ADR lives inside the document
  that raised it rather than in a folder of its own. Which is also why carrying your ADRs across is
  the one step that may have to wait until you have a document to hang them on; see step 4.

---

## First: `docs/` becomes generated output

**Do this before you run anything else.**

The thing to understand up front is that DPM writes markdown into `docs/` as a side effect of its
own work. Once you start using it, twelve folders under `docs/` stop being things you maintain and
become output — regenerated from DPM's data whenever it publishes:

`plans` · `briefs` · `specifications` · `epics` · `reviews` · `retros` · `quick` · `discussions` ·
`communications` · `audits` · `runbooks` · `library`

Your CPM history lives in some of those same folders. Because DPM regenerates them, it also tidies
up files in them that it thinks are its own leftovers — and a good number of your CPM documents are
named closely enough to qualify. It always asks first, and `/dpm:publish` shows you the list before
removing anything, but you do not want to be making that judgement one file at a time months from
now.

**Move all twelve, not the ones that look risky.** Which folders are actually in danger today comes
down to whether CPM and DPM happen to use the same word for the same kind of document — they both
say `spec`, but CPM's `plan` is DPM's `problem_brief`. That is a coincidence rather than a promise,
and one rename in a future version of DPM turns a safe folder into a doomed one with nothing to tell
you. Sorting them is work you would have to redo on every upgrade, and getting it wrong costs files.

So move your history somewhere DPM does not look at all. `docs/cpm/` is not one of the twelve, and
DPM only ever looks one folder deep, so anything under it is permanently out of reach:

```sh
mkdir -p docs/cpm
git mv docs/plans docs/briefs docs/specifications docs/epics docs/retros docs/quick \
       docs/discussions docs/communications docs/reviews docs/audits docs/runbooks \
       docs/library docs/cpm/
```

`git mv` fails on a folder you do not have, so drop from that list any you never used — CPM never
writes `audits` or `runbooks`, so most people will drop those two.

**Use `docs/cpm/` rather than `docs/archive/`.** If you ever ran `/cpm:archive`, you already have
`docs/archive/epics/` and friends, and moving a folder onto an existing one of the same name just
fails. A separate home also keeps the two meanings apart: `docs/archive/` is work you archived while
using CPM, `docs/cpm/` is everything from the CPM era, parked. Both are equally invisible to DPM, so
leave any existing `docs/archive/` exactly where it is.

**`docs/architecture/` stays exactly where it is.** DPM has no folder for architecture decisions —
it renders them inside the document that raised them — so it never writes there and never looks
there. Leave your ADRs alone.

After this, expect `docs/specifications/` and the rest to fill up again with DPM's own files. That
is the system working. Two rules follow from it, and they're permanent:

- **Never move your archive back**, and never hand-write into those twelve folders. Anything you put
  there is competing with a generator.
- **`docs/cpm/` is now where your history lives.** It stays readable, greppable and in git
  exactly as it was — every path in the rest of this guide assumes it is there.

This step alone is a complete, valid migration. If you stop here, DPM works fine — it just starts
with an empty slate. Everything after this is a head start, not a requirement.

---

## What is worth carrying over, and what is not

When a DPM skill starts work, it looks at four things:

- **your library documents** — coding standards, architecture notes, domain glossaries
- **lessons from past retros** that are still true
- **decisions that still constrain the work** — your ADRs
- **the constraints on any project still in flight** — the environment, the things you can't change

That's the list. It does not look at your old specs, epics, coverage matrices, quick records or
review findings — not because they're unimportant, but because they're **finished**. Nothing in DPM
ever consults a completed epic. Carrying one across is typing you'll never get back.

The rule of thumb: **if it still tells a future conversation something it needs, carry it. If it
records what already happened, leave it.**

---

## Carrying the four things across

Ask for these **in this order**, in one conversation or several — each gives the next something to
attach to. Claude will handle the mechanics; you're deciding *what* goes, not *how*.

The fourth takes that principle one step further out: a decision has to hang off a document, and on
a freshly migrated repository there isn't one yet. Read step 4 before you start, because the answer
may be *not today*.

### 1. Constraints, if any project is still in flight

If you have work that hasn't finished, its constraints are worth having — the environment it has to
run in, the things it must not depend on. DPM asks about these early in every new spec, and anything
already recorded is something you won't be asked for twice.

> "We're continuing the billing work. Its constraints are in
> `docs/cpm/plans/03-plan-billing.md` under Constraints — carry those into DPM."

If nothing is in flight, skip this.

### 2. Your library documents — the one that matters most

**If you only do one thing, do this one.** Library documents are read by every DPM skill, every
time. A coding standard left as a file in `docs/cpm/` is a coding standard no skill will ever
see again.

> "Carry `docs/cpm/library/` into DPM's library. Each one should be readable by the same
> skills its front-matter lists in `scope:`."

That last part matters. Each library document is marked with which skills should read it — some are
for whoever is writing code, others for whoever is making architectural decisions. If that gets
lost, the document is in DPM and no skill picks it up. Say it explicitly and check it afterwards.

**Watch for amendment sections.** CPM library documents grow `## Amendment — 2026-03-14 (via retro)`
blocks over time. DPM expects a document to read as one document, so ask Claude to fold each
amendment into the part it changes rather than copying the trail:

> "Fold the Amendment sections into the body as you go — I want each document to read as one
> current document, not as a history of edits."

### 3. Lessons you've learned

If you've been running `/cpm:retro learn`, the lessons that earned their keep are already collected
in `docs/cpm/library/lessons-learned.md` — which means step 2 already brought them across, and
this is usually the densest, most valuable thing in the whole migration.

What's left in the individual retro files is mostly the transient stuff the promotion process
deliberately left behind. Scan them, and if two or three observations are still genuinely true and
never got promoted, mention them:

> "There are a couple of lessons in `docs/cpm/retros/` that never got promoted and are still
> true — the one about the payment sandbox, and the one about migrations on the read replica. Add
> those to DPM as retro observations."

Expect this to be a short list. If it isn't, that's usually a sign step 2 hasn't been done yet.

### 4. Decisions that still bind

Your ADRs, but only the ones still in force. Skip anything superseded, and anything that only ever
constrained work that's now finished.

This one is different from the other three, in a way that decides *when* you do it.

**A decision has to hang off something.** In CPM an ADR was a file in its own folder, answerable to
nothing. In DPM it is part of a document — a spec, a brief, or a recorded discussion — because a
decision made in the abstract is a decision nobody can tell you the reason for later. So before you
can carry one across, you have to say what it belongs to, and a repository that has just migrated
has nothing yet.

That gives you two moments to choose between:

- **You already know what you're building next.** Write that spec first — `/dpm:spec` — and carry
  the decisions that bear on it onto that spec. This is the better option whenever it's available,
  and the reason is the step after: when you break the spec into epics, the breakdown reads *that
  spec's* decisions. A decision recorded somewhere else won't reach it, and won't shape the work it
  was supposed to constrain.
- **You don't, or the decisions are older and broader than any one piece of work.** Have them
  recorded against a discussion instead, created for the purpose. Say what it's for; that sentence
  is the context a bare list of decisions would otherwise be missing. **Make a new one** — if you
  have a discussion already it is probably the record of this migration, and hanging your
  architecture off the conversation about moving tools reads to the next person exactly as wrong as
  it is.

> "Before I start anything new: make a discussion called *Architecture as it stands*, saying these
> are decisions inherited from the CPM era and still in force. Then carry
> `docs/architecture/02-adr-event-sourcing.md` and `05-adr-multi-tenancy.md` into it."

Note the path — `docs/architecture/` did not move, because DPM never touches it. Your ADR files stay
readable exactly where they are; what you're doing here is putting the ones that still bind
somewhere DPM will read them.

**Say which option you took, not just what the document concluded.** DPM records a decision as
*proposed* until one of its options is marked as the one chosen — that's what turns it into an
accepted decision rather than an open question. A decision that has been binding your architecture
for two years arriving as *proposed* is worse than not carrying it, because the next conversation
will treat it as still up for debate. So name the option you went with:

> "Multi-tenancy by schema is the one we chose and it's still in force — record it as accepted."

**Ask for the rejected options too.** A decision that records only what was chosen doesn't tell a
future conversation anything — the value is in what was considered and set aside, because that's what
stops the same argument being had again. DPM keeps each option and how it scored against the axes you
compared them on, so this is worth the extra sentence:

> "Include the options we rejected and why, and how they compared — that's in the *Considered
> alternatives* section of each file."

If none of this is decidable yet, **leave it**. Steps 1 to 3 are a complete migration on their own,
and your ADRs are still sitting in `docs/architecture/`, unchanged and unread by anything. Coming
back for them when you write your first spec costs nothing; carrying them onto a placeholder now
costs you the one thing that made them useful.

---

## Checking it worked

Don't count things. Run something and see whether it notices.

Start a new spec in the project:

```
/dpm:spec
```

Read the first few lines of what it says back. It should tell you what it found — something like
*"Found 2 existing decisions: Event sourcing for the ledger, Multi-tenancy by schema"*, and a note
naming the library documents it's going to use.

- **It names your decisions and your library documents** — the migration worked. Stop here.
- **It names your library documents and no decisions** — expected, if you left step 4 for later.
  This run is the moment to come back to it: there is now a spec for the decisions to hang off.
- **It says it found nothing at all** — the material is in DPM but not reachable. Nine times out of
  ten that's the scope from step 2: the documents are there, but nothing knows which skills should
  read them. Say so and ask Claude to check.

You can stop the spec run as soon as you've read the startup lines. You're testing the migration,
not writing a spec.

---

## Three things that catch people out

**A library document with no scope looks completely fine and does nothing.** It imports without
error, it's there if you go looking, and not one skill will ever open it. This is the single most
common way a migration ends up half-done, and the check above is how you catch it.

**Do it in conversation, a few files at a time.** It's tempting to ask for the whole corpus in one
go, or to ask Claude to write a script. Don't. Turning your prose into DPM's data is exactly the
job DPM refuses to do automatically, for the same reason it's worth your attention here: the
judgement about what's still true and what's finished is yours, and it can only be made one document
at a time. Read what comes back.

**Less will carry over than you expect, and that's the design.** A project with three years of CPM
history might carry across four library documents and a handful of lessons. That can feel like
you've thrown something away. You haven't — it's all still in `docs/cpm/`, still in git, still
readable by you and by Claude whenever you ask. What's changed is that DPM won't be reading it over
your shoulder, which is precisely what makes it faster.

**Your decisions are the exception, and the count depends on the project.** If your architecture was
settled up front — how sync orders and merges, how auth works across platforms, where the data layer
sits, what the release channel is — then most of your ADRs are still binding and most of them should
come across. Ten is not a sign you're carrying too much; it's a sign the decisions were made at the
start rather than accumulated as you went. What to skip is what's *superseded* or spent, not what's
numerous.
