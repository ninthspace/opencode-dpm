# A check that shares its subject's error cannot fail

**Number**: 06  
**Status**: pending  

**Type**: testing-standards  
**Scope**: do  

## A check that shares its subject's error cannot fail

A test fails when it and its subject disagree. When the mistake is in both, there is nothing left to disagree about — the check runs, reports clean, and is indistinguishable from one that verified something. This project has produced it three times in three shapes.

- **The driver that calls the export itself.** A test that reaches into a module and invokes its function asks a question about that function; whether the *host* will accept the module can only ever come back yes. Four green suites certified an install that had never once loaded.
- **The reader with a default.** `JSON.parse(block).permissions ?? []` cannot report failing to find its subject. Ten tests read a key that was not in the document, got an empty list, and passed over it in silence — including the one whose whole purpose was to notice.
- **The fixture written in the reader's own wrong direction.** Three fixtures wrote a dependency edge backwards and a template read it backwards; each pair produced the right-looking line. A fixture is an input and it teaches: one written the wrong way round teaches the wrong way round to whoever reads it next.

The floor idiom — assert the corpus is non-empty before filtering it — catches none of these, and why is the transferable part. `rules.length >= 3` asserts that the extractor found three things. It does not assert that the three are the three in the document. The floor sits on the *result* of the reading rather than on the reading itself, and one step is all it takes.

What does catch them:

- **Assert the shape you refuse, as an absence, driven red over a planted instance first.** The refused shape must come back empty, and the control plants an instance of it and shows that the same reading both finds it *and* yields no rules — the two facts that together made the old reading silent.
- **Find an oracle outside the pair.** Where a reader and its fixture can agree with each other, only something neither produced can tell them apart: the running host, the previous release, a query down a different code path. See *Find the oracle before writing the expectation*.
- **Read every `??` in a document-reading test as a question.** `?? []`, `?? {}` and `?? ''` are each a place where a renamed key becomes a clean pass.

The consequence for naming: a test named for the property it means to check, over a reading that cannot observe that property, is worse than no test — it occupies the slot where the real one would have been written, and its name is what stops anyone looking.
