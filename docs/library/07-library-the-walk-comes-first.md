# The walk comes first

**Number**: 07  
**Status**: pending  

**Type**: architecture  
**Scope**: do, epics, spec  

## The walk comes first

**An artefact that is internally coherent can still be wrong about the running thing, and reading it harder will not say so.** One epic produced three, in ascending order of cost: an acceptance criterion naming a comparison the code no longer had; an SDK whose published types describe a route the host it ships with cannot reach; a README section recommending a configuration that makes the host refuse to start. Each was self-consistent, none was detectable from inside itself, and every one was answered by starting the host and looking — a `curl` against a running server, or one command in a throwaway directory, in under a minute.

So the end-to-end trip through a real host is the **first** story of a porting or integration epic, not the last. Its value is not proportional to how much has been built; it is highest when least has been, because that is when the artefacts being written are the ones that will be wrong.

**And a lesson is not a substitute for a scheduled story.** *Ask the host, not a test's idea of the host* was in the library, was recalled at the retro gate, and was correctly dispositioned as applying — and the suite still had no test that could go red, because applying it meant building a fixture that starts a host, and every incremental step pointed somewhere cheaper. Nothing was lazy; each next thing written was a reasonable next thing. The gap was structural.

The rule that follows: **when a lesson's application requires a fixture nobody will build incrementally, it stops being a lesson and becomes a story with a number.** At breakdown, ask of each library entry whether applying it is a habit or a build. A habit can be carried into the work; a build has to be planned, or it gets re-dispositioned as "applied" every run with nothing built.

Two practical notes on the walk itself. Make it a throwaway directory rather than the repository, so what is being exercised is an install and not a working tree. And give the walk a criterion of its own that names an artefact it must produce — a log line, a registry listing, a byte comparison — because a walk with no recorded reading is an afternoon of impressions, and the next run cannot tell it from one that was never taken.
