# A pivot owns what it un-binds

**Number**: 08  
**Status**: pending  

**Type**: architecture  
**Scope**: epics, pivot  

## A pivot owns what it un-binds

**Retiring a coverage binding is half a move.** Withdrawing the row stops the fragment being quoted; it does not decide what now answers the requirement. A pivot that retires and stops has left the requirement in no recorded state at all — not covered, and not knowingly uncovered either. It goes quiet rather than going open.

The pivot on spec 02 retired nine bindings as the host retargeted from v2 to v1, and re-bound none. That left three requirements with no live coverage, six story criteria with neither a binding nor a warrant, and two criteria describing an implementation deleted the same week. None of it surfaced for nine days, until a gap check run by hand over the whole spec found it.

**Nothing in the database was going to say so**, and that is the part worth keeping rather than the count. The integrity register checks the fragments that exist — a quotation no longer verbatim is a broken invariant — but a requirement with zero bindings quotes nothing and breaks nothing. The coverage matrix is per-epic, so a requirement whose only binding was withdrawn does not render as an empty row anywhere; it stops appearing. As *An absence is only an observation when something was watching* has it, the absence is visible only to a query over the spec — which is the one place nothing runs on its own.

**So a retirement and its successor are one decision, taken in the same run.** For each binding withdrawn, the requirement ends the pivot in one of three recorded states: re-bound to a criterion that still holds; marked knowingly uncovered, with the band and the exclusion saying so; or amended so the obligation is gone. "Someone will pick it up" is not one of them.

**The criterion end has a column and needs no judgement.** `accounted_for` is set when a story criterion has a live binding or a warrant, so after the retirements, list the criteria of every story the pivot touched and read it. One that was accounted for before the run and is not after is what the pivot orphaned; the answer is a re-binding, a warrant, or supersession carrying the reason the criterion died.

At breakdown, a spec that has been pivoted is read for uncovered must-haves before its epics are trusted. That is what the gap check is for, and why it is a query over the spec rather than a sum of what the run just wrote.
