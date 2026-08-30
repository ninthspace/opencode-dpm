# Find the oracle before writing the expectation

**Number**: 03  
**Status**: pending  

**Type**: testing-standards  
**Scope**: do  

## Find the oracle before writing the expectation

A test that compares a port against a value the port generated is a self-portrait. It passes on the day it is written and goes on passing through any drift made consistently — which is exactly the shape a large rename or a mechanical rewrite takes. So before generating an expected value, look for a copy of the thing being ported.

It is usually closer than it seems: the previous release still installed on the machine, an artefact the old code left in the repository's own history, a published copy that predates the change. One command against a real oracle buys a categorically stronger claim than a snapshot — byte-identical output, or zero differing lines — instead of internal consistency.

Where the change is mechanical, **invert it**: reverse-substitute the new form back to the old and diff against the oracle. That says what was *not* touched — no procedure prose, no gate wording, no table — which is a claim no passing suite can make, because the suite was being edited alongside the thing it checks.

Two cautions. A frozen oracle is a fixture and inherits whatever rules govern fixtures; narrow those rules by naming the oracle rather than by exempting its file extension, since an extension-shaped hole admits the next thing that should not be there. And where no genuine oracle exists, say so and pick a different claim — generating one and calling it a fixture is the failure this entry exists to name.
