# dpm Shared Skill Conventions

Procedures used by several dpm skills. A skill that says "follow the shared **X** procedure" means
the section of that name below.

**Read this file when a skill references it.** dpm ships no session hook, so nothing injects these
sections — a skill names the file and reads it, which costs one read per run rather than seven
sections repeated in twenty-two files.

**What earns a place here.** A section belongs in this file when several skills reference it. One
referenced by a single skill belongs in that skill; one referenced by none is documentation rather
than context, and belongs wherever the project keeps its documentation.

**Nothing here describes what a tool already does.** Prose restating a tool's behaviour is a second
specification of it, and the two drift — the prose being the copy that no test holds to account.
Numbering is the clearest case: `mcp__plugin_dpm_dpm__create_epic` allocates, and a paragraph here explaining
how would be a rule nothing enforces.

**A procedure carrying judgement the tool does not is a different thing, and it belongs here.**
Which sessions are stale, how many observations to select and on what, whether a retro's lesson is
presented before it is used — none of that is in a tool, and all of it has to be the same in every
skill or the corpus behaves differently depending on which one a project happens to run. The test is
not "does this mention a tool" but "would two skills implementing it separately agree". **Perspectives**
has always been here on those terms, and the three startup procedures below joined it for the same
reason: they were near-verbatim in ten files, which is ten places for one of them to drift.

**Where a skill's own judgement lives.** Each procedure names the small part that is genuinely
per-skill — the scope keyword, what the session `state` must hold, what an incorporated lesson
changes — and the skill states that part and nothing else.

## Session Startup

Every skill's run is one `session` row, and nothing else on disk records where it reached.

1. `mcp__plugin_dpm_dpm__list_session` for what is open. A row whose `updated_at` is more than three days old
   is stale; present those and let the user decide, deleting nothing that was not named.
2. On a resume, `mcp__plugin_dpm_dpm__adopt_session` with the new session id and the predecessor's, passing
   `include_body` so the state comes back. It returns what the earlier run carried and points the
   old row at this one.
3. Otherwise `mcp__plugin_dpm_dpm__create_session` with the harness's session id, the skill's own name as
   `skill`, and the step or phase about to start as `phase`.

As each step closes, `mcp__plugin_dpm_dpm__update_session` moves `phase` on and carries the accumulated
`state` — a blob the skill defines and dpm does not interpret.

**What `state` holds is the per-skill part, and it is the part worth stating.** It is the run's
memory: what a step settled goes in as it is settled, because a step summarised only in the
conversation is one that has to be re-facilitated after a compaction. **It does not hold anything
that is a column** — a status, a number, a flag — because a copy in the blob is a second answer that
goes stale the moment the row moves.

## Library Check

1. `mcp__plugin_dpm_dpm__list_library`, then `mcp__plugin_dpm_dpm__list_library_scope` on each, to find those scoped to
   the skill's own keyword or to `all`.
2. Read the ones that apply with `mcp__plugin_dpm_dpm__list_document_section` and
   `mcp__plugin_dpm_dpm__read_document_section`, passing `include_body` — without it a section comes back as a
   heading with no text, and a run that omitted it has read nothing and does not know.

A section a consolidation has superseded is not returned — the list omits it — so a document that has
been amended and reconciled reads as one document rather than as a body followed by the amendments it
already absorbed.

The per-skill part is the scope keyword and *when* the documents bear: a coding standard is read
before code is written, an architecture document before a structural decision.

## Retro Awareness

1. `mcp__plugin_dpm_dpm__list_retro`, then `mcp__plugin_dpm_dpm__list_observation` on the ones whose subject overlaps this
   work, passing `include_body`.
2. Each observation's category is `mcp__plugin_dpm_dpm__list_observation_category` resolved against
   `mcp__plugin_dpm_dpm__list_taxonomy`, which is called with a `limit` above the seeded count so a project
   that added terms does not lose them to the default page.
3. **Select the few most relevant rather than everything from the newest retro**, judging by subject
   overlap and category and using recency only to break a tie.
4. Present the selection, naming its source retro, and ask whether to incorporate.

A retired observation is not returned — the list omits it — so there is nothing to skip and no
marker in the text to read for.

The per-skill part is what an incorporated lesson *changes*: which step or phase a category routes
to, or, where a skill has no such routing, what a lesson turns into instead. A lesson that cannot be
turned into something this skill does is one to leave.

**A skill that must not merely offer this may replace step 4 with a gate of its own** — `dpm:do`
does, requiring a disposition per observation and recording each as a row. Steps 1 to 3 are the same
either way.

## Gate Presentation

`AskUserQuestion` carries the *gate*, not the *content*. The preview panel that renders it is sized
for short prompts and short option labels, and long content is truncated there.

Render documents, drafts, alternatives, tables and lists of proposed changes in the message body
**before** the `AskUserQuestion` call. The question itself carries only the decision — "Approve" /
"Request changes" / "Stop", or "Choose A / B / C". If what the user needs to read runs past a
sentence or two, it belongs in the message body.

Option `preview` fields are for small presentational comparisons — a wording choice, a short
layout variant. They are transient and easy to miss, so nothing the user needs to keep goes there.

## Perspectives

Some sections invite agent personas to weigh in before the user decides.

1. **Load the roster** with `mcp__plugin_dpm_dpm__list_agent`, passing `include_body`. Its rows carry
   `display_name`, `icon`, `role`, `personality` and `communication_style` — **the last two are body
   columns**, so without that argument the list comes back with names and roles and the voices below
   are woven from nothing. A project that added a persona has it in that list; nothing is read from
   a file and nothing is invented beyond the row.
2. **Select two or three** whose `role` and `personality` bear on the decision at hand.
3. **Each gives one or two sentences in character**, formatted `{icon} **{display_name}**:
   {perspective}`. Let `communication_style` and `personality` drive tone and framing so the voices
   stay distinct.
4. **A perspective that only echoes what has been said is skipped.** The value is in surfacing a
   trade-off or challenging an assumption.
5. **Weave them into the facilitation** before the user decides, rather than presenting them as a
   section of their own.

If `mcp__plugin_dpm_dpm__list_agent` returns nothing, skip perspectives and carry on.

## Conversational Output

Aim for the shortest response that does the job. A skill's product is the rows it writes and the
artefact rendered from them; the conversation around it is scaffolding.

Between gates the useful shapes are: the content itself followed by the gate; one line recording
what was decided and where it went; the step and what it found rather than the process; and
anything unexpected said plainly with its evidence, at the moment it turns up rather than saved for
a summary.

The test is whether someone reading only the narration still knows where they are and what was
decided.

### Disposition

Every item a report mentions carries one of four dispositions, and the disposition names what the
**reader** has to do about it rather than what you did:

- **Fixed** — the repo is different now; read it and carry on.
- **Left alone** — it was seen and deliberately not acted on; nothing is waiting.
- **Unverified** — the check was impossible here, so the claim is still open; the reason names what
  would close it.
- **Needs you** — it is waiting on the reader, and nothing else in the report is.

The four are the `disposition` domain. Read them with `list_taxonomy` and render them in the
`position` order the domain carries, rather than transcribing the labels or the order into a skill.

**The label follows the reader's obligation, not your action.** Something fixed that is also worth a
glance is Fixed with the note attached, never Needs you. A Needs you that absorbs "and you may want
to look at this" stops meaning anything, and the one item that was genuinely waiting is then lost
among the ones that were not.

**An item that fits none of the four is not reported.** Work considered and rejected, the steps
taken to reach an answer, and a restatement of what the reader has just approved carry no
disposition, because there is nothing for the reader to do with any of them.

**A disposition with no items is not rendered at all** — no heading, no "nothing to report" line.
The same rule one level up: a block saying it is empty is a block the reader has to read to learn
there was nothing in it, and a report whose four headings are always present costs its reader four
readings to find the one or two that carry anything. A run that fixed everything it touched says so
in one block and stops. Absence is read from the absence of the heading, so the surviving blocks
still arrive in the order above and the reader may still stop once the actionable one has passed.

**In a report, the order is fixed** — Fixed, Left alone, Unverified, then Needs you last and
together, each one written as an imperative naming the action and where to take it. A reader who
stops after the third block has missed nothing that was waiting for them, which is what fixing the
order buys. This is the arrangement of a report; something unexpected found mid-work is still said
when it turns up, and carries its disposition there.

**Unverified means the check is impossible in this environment**, and the item says why. Two cases
qualify, both structural: a `target` criterion, whose environment nobody here has, and a must-NOT
with no control, where nothing available can make the check fail. A reason about how the run went —
the tests fail, it was not implemented, there was no time — is **Needs you** instead, however
genuinely it blocked you.

### Correcting yourself

Narrate a correction to something said earlier when the error would change the user's conclusions
or decisions. When it would not, make the correction and carry on without remarking on it. A
running commentary on your own earlier wording spends attention the user was giving to the decision
in front of them.

## Written Deliverable Length

Let a document's length match what the task needs. A spec covering three requirements is shorter
than one covering thirty, and that is the right outcome rather than an incomplete one.

Leave out padding that restates a point because a section looked thin, closing recaps of what the
reader has just read, and headings kept because a template offered them and then filled with "N/A".

This is calibration, not a budget. No artefact carries a fixed word or section count.

## Cross-References

A sentence in one artefact naming another — an epic's notes saying which epic holds the other half,
an observation citing the spec it came from — is written `{{ref:<id>}}`, carrying the target's id.
The renderer resolves the marker to that document's current human identifier.

**Never write the number.** It is correct on the day it is written and stops being correct the
moment anything renumbers its target, and by then nothing can find it to repair: a number inside a
sentence is indistinguishable from every other number in that sentence. The id is already in hand —
it is what the list or read tool that found the artefact returned — so the marker costs nothing that
the number does not.

**A structural reference is not this.** Where the relationship is a column — an epic's spec, a
coverage row's requirement, an artifact's document — write the foreign key and leave the prose
alone. A marker beside a foreign key is one fact recorded twice, and the two disagree the first time
either is edited.

**Something that is not a document gets no marker.** A commit, a ticket, a URL, a file in the
repository: none has an id, so each is named plainly in the prose as what it is. A marker naming
something that cannot be resolved is refused at render time, so inventing one to look consistent
turns a loose reference into a projection that will not build.

## Naming a Document

**Say the reference and the title** — `<reference>`, then the document's own title, taken from the
row you already hold. That pair is what a person can read back to you, type as an argument, and find
in the rendered tree, and every list or read tool returns the reference on the row beside the columns
it was asked for — so the naming costs the run nothing it has not already paid for.

The reference goes in as the row gave it, never written out from memory: a number typed into a
sentence is correct on the day it is typed, which is the failure Cross-References describes at
length and the reason this section carries no worked example of one.

**The id keeps the two places it works**: a tool argument and a foreign key. Both are read by
software that has the row in hand, and neither is read aloud.

**Where a reference is `null`, say the title and the kind and say the document has no reference
yet.** A row comes back unnamed when it is numbered `none` or when its parentage reaches no
root-numbered ancestor — legitimate states, not failures — and the honest sentence is *the untitled
scratch document, which has no reference yet*. Reaching for the id instead answers a question the
person did not ask, in a string they cannot use.

**This governs what is said; Cross-References governs what is stored.** They are separate because
the answers differ: a sentence spoken now is read once and a sentence written into a body is
re-rendered for as long as the row lives. So a document named inside stored prose — a body, a plan,
a decision, an observation — is written `{{ref:<id>}}` and resolved at render, for the reasons that
section gives. Speaking a reference and storing a marker are the same rule under one derivation:
both end at the identifier the projection computes.

## Artifact Publishing

A skill may publish an HTML artifact from its output **on request**. It is always separately
confirmed and never the default.

1. **Offer only when asked**, or when the skill's own text names an artifact worth offering.
2. **Confirm with a gate** before publishing. Publishing puts the content on a URL.
3. **Justify it in one line** — what the visual carries that the prose cannot. If that line cannot
   be written, the artifact has not earned its place.
4. **The artifact is a view, never a source.** Nothing reads it back; the rows remain the record.

## A Closing Note on Length and Tone

Say what the step found and what happens next, then stop. Where two phrasings carry the same
meaning, use the shorter one.

Keep the tone plain and direct, warm enough to be good company across a long facilitation. State
confidence where the evidence supports it and uncertainty where it does not; neither needs padding.
