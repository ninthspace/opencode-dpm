# Never match on a string another string can contain

**Number**: 04  
**Status**: pending  

**Type**: coding-standards  
**Scope**: do  

## Never match on a string another string can contain

Substring matching answers a different and much weaker question than the one being asked, and on the machine where it was written the two are indistinguishable. It has produced a false result in this project four times, in four different shapes:

- a search for a replaced literal matched **inside the absolute path that replaced it**, reporting every body unported against a set with none;
- a skill id matched **inside the executable path named after it**, reporting a skill as offered by the one refusal that must not offer it;
- a section anchored on its own opening sentence matched **a shorter restatement of the same point elsewhere in the document**, so the failure named two sections and neither of them correctly;
- a containment check written as `a.includes(b)` had been green since before the port and fired the first time the repository was checked out at a different path.

Match on structure the artefact actually has, or on a token that cannot occur inside its own replacement:

- **Path containment** is `relative(a, b).startsWith('..')`, and nothing else.
- **To find a section**, extract the element — the blockquote, the fenced block, the heading's span — and assert how many exist.
- **To ask whether a message names something**, export the phrase and match that; an identifier that is a substring of a path is not a safe thing to match on.
- **After any rename**, grep for the predicates that filter on the old form — `endsWith`, `filter`, escaped `\.js` — separately from the literal name. Those are part of the rename, and the ones that go quiet are more dangerous than the ones that break.
