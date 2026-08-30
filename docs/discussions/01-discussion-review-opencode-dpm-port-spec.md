# Review of the opencode-dpm port spec

**Number**: 01  
**Status**: complete  

## What was reviewed

The library document 01, immediately after import — the design spec for porting dpm v0.7.0 from a Claude Code plugin to a standalone OpenCode v2 repository.

The room went at it as a plan to be executed rather than a document to be admired, so the findings are about what the plan does not survive contact with: a boundary drawn in one decision and crossed by a requirement, a language constraint stated at half its true width, and a Could Have carrying more work than every Must Have combined.

Four amendments were agreed and one question was settled by the user. Nothing was written to the document during the discussion.

## AD8's model-facing boundary is drawn one clause too narrow

AD8 states that only two parts of dpm are model-facing — skill prose and the advertised tool surface — and that everything beneath them is deterministic code no model touches. FR14 then specifies that lite-profile tool refusals are rewritten as single sentences that name the field and state the correction, on the assumption that a small model retries from the error text rather than from documentation. Those strings live in the server, below the boundary AD8 has just declared impassable.

Margot named the two honest resolutions: move the boundary down to include refusal text, or make FR14 a registration-time wrapper that rewrites refusals on the way out. The document as written claims the first is unnecessary while requiring it.

**Decision: keep AD8 and amend it.** The user kept the decision, and the room agreed the clause is worth adding even though FR14 itself is being deferred. The reasoning is inheritance: 01 is scoped to `architect` and `spec`, so the deferred lite spec will load it and take AD8 as given. Left as written, that spec re-derives this exact contradiction later with less context available to resolve it. The amendment is one clause — model-facing means skill prose, the advertised tool surface, and the text of tool refusals.

Margot also made the case for why AD8 must not simply be deleted along with the requirements it enables: it is the reason skill IDs and tool advertisement go through registration rather than being baked in. Remove the decision and the seam disappears in milestone 2, when someone hardcodes the skill list into the plugin entry and nothing in the plan objects.

## FR13 is deferred, and the target spec is created first

Jordan's objection was to the placement, not the ambition. FR13 re-scopes seven skills as terse imperative checklists, hard-trims every tool description and schema, inlines the shared conventions rather than reading them at startup, sets and measures a context budget against a named decode-rate curve, and takes on an unproven assumption about 4-bit tool-call adherence. That is a second project wearing a bullet point, and it sits in Could Have beneath Must Haves that are each a fraction of its size. It is also the only requirement in the document with a target user who is not the author.

**Decision: FR13 is explicitly deferred to a subsequent spec**, on the user's reasoning that the lite profile is an iteration on what is being built now rather than part of it — so it earns its own document even if that document initially holds very little.

Ren supplied the condition that makes it a deferral rather than a deletion: the subsequent spec has to exist as a row before 01 can point at it. A redirect to nothing is scope that returns through the side door during milestone 4, when someone reasons that they may as well, while they are in there. What it costs is one spec run; what it buys is that the port has five milestones and a visible end.

Elli established the ordering, and it is not cosmetic. A document naming another writes `{{ref:<id>}}` and never the number, so the deferral sentence cannot be written until the target has an id to carry. Written the other way round, the amendment reads as a sentence about a future lite-profile spec and resolves to nothing. Create the stub, take its id, then amend. She also argued for naming it after the lite profile rather than a phase or an ordinal, which ages badly the moment there is a third.

FR14 leaves with FR13, being lite-only — but the AD8 clause it exposed stays, for the inheritance reason above.

## Import-extension discipline becomes its own requirement

AD3 constrains the codebase to erasable TypeScript so Node 24 can type-strip and run the sources directly, and names the constructs to avoid — `enum`, namespaces with runtime meaning, parameter properties. Bella's point is that this is the easy half. Native type-stripping also requires import specifiers to resolve exactly as written, so every internal import must carry the `.ts` extension, and `tsc --noEmit` then only accepts that under `allowImportingTsExtensions`. That constraint touches every file in the repository, where the named constructs touch a handful.

Risk 4 says a violation fails immediately because CI runs the suite under plain `node` with no loader. That holds for `enum`. It does not obviously hold for a missing extension in a module that no test happens to import.

**Decision: a separate checkable requirement, per the user's call for Bella's position over Margot's.** Margot argued it belongs inside AD3 as a consequence of a decision already taken; Bella argued it needs its own line because CI has to test for it separately, and separate enforcement is what carried the decision. The distinction is real — one is an architectural consequence, the other is a thing a machine has to check on every commit, and folding the second into the first leaves nobody accountable for writing the check.

## Deferring FR13 strands risk 2

Tomas traced a consequence the deferral creates rather than removes. Risk 6 — whether a 4-bit 27B can drive typed MCP tools through gated facilitation — leaves cleanly with FR13, and the room was content to see it go, being the one item nobody could close without hardware present.

Risk 2 is the casualty. It asks whether `ctx.skill.transform` with a package `location` gives registered skills the supporting-file sample that directory-based skills get, and its stated fallback is that skills inline their critical references. FR13 was quietly the evidence base for that fallback working: *conventions inlined instead of the read-at-startup file* was going to be tried under lite first. With lite deferred, the fallback has no precedent anywhere in the plan, and if risk 2 lands badly the port inlines the shared conventions into twenty-three skills with nothing to say whether that is survivable — reintroducing precisely the duplication the conventions file exists to eliminate.

**Recommendation: promote risk 2 to a milestone-2 gate with a written go/no-go**, rather than leaving it as a bullet in a risk list. It gates FR3, which gates the entire skill port.

## Agreed amendment sequence

One pass over 01, in this order — the ordering is load-bearing at step 1 only, for the reference reason Elli gave.

1. Create the lite-profile spec, so it has an id to be referenced by. It may hold very little; what it must hold is a title, the problem it will eventually solve, and enough of FR13's substance that the material is not lost in transit.
2. Amend AD8 with the refusal-text clause.
3. Replace FR13 and FR14 with a redirect carrying `{{ref:<id>}}` to that spec, leaving the profile seam decision itself intact in AD8.
4. Add the import-extension requirement as its own checkable line, with the CI check named.
5. Drop risk 6; promote risk 2 to a milestone-2 go/no-go gate.
6. Drop milestone 6, which was the lite build.

Ren's note on batching: steps 2 to 6 are one amendment pass, not five. Splitting them means the document is internally inconsistent between passes, and a Library Check running in that window loads a half-amended constraint.

## Still open

**Risk 1 was never discussed and remains the first implementation task.** The effective rendered name of MCP-provided tools under OpenCode v2 — namespacing, character substitution — has to be verified against a running beta before any skill prose is rewritten, because skill bodies name tools. Nothing the room decided changes that, and it is upstream of the whole skill port.

**Whether the lite-profile spec is written now or at deferral time.** The room assumed now, because step 1 of the amendment sequence requires an id. If it is written later, the amendment to 01 cannot carry a resolvable marker and the deferral is a promise in prose.

**How much of FR13's substance the stub carries.** Ren wanted a pointer; Elli wanted the material preserved so the reasoning behind the skill selection — the daily loop rather than simplicity — is not reconstructed from memory later. Not resolved.

Three of the nine in the room did not speak: Priya on the invocation change from `/dpm:` to skill-first, which is a user-facing ergonomics shift nobody examined; Casey on what level of test proves the port correct beyond the ported suite; Sable on the guard symlink target and the npm publish path. Each has a live surface in this document.
