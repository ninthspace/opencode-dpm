# An absence is only an observation when something was watching

**Number**: 02  
**Status**: pending  

**Type**: testing-standards  
**Scope**: do, epics  

## An absence is only an observation when something was watching

A check that reports nothing has two explanations and looks the same either way: the thing is absent, or the instrument never ran. Before recording a must-NOT — or any negative result — as met, name the run that would have produced a non-empty answer, and show that it does.

Concretely:

- **A sweep asserts its corpus, not only its silence.** `deepEqual(found, [the expected set])` beside the violation check, with a message saying the corpus moved. A sweep whose input is derived — from an extension, a directory listing, a regex — can quietly enumerate nothing and report clean.
- **A rule that matches nothing fails as loudly as a rule that matches a breach.** Without that, deleting the thing a rule guards leaves the rule guarding an empty set and the suite reporting green.
- **An instrument proves it can record before its silence is read as evidence.** An empty log is exactly what an instrument that never loaded produces.
- **A flag whose effect is invisible when honoured is probed both ways.** A step that runs offline and passes is indistinguishable from a step whose isolation was silently ignored.
- **Prefer recording to blocking.** A recorder cannot be caught by a `try`/`catch` up the stack; a thrower can, and the swallowed refusal then looks exactly like never having tried.

Put the control in the same test that relies on it, so the reading and the proof of the reading cannot drift apart. And write controls that tolerate the hazard being absent: a control that demands the hazard be present fails on the clean machine, which is a bug in the control rather than a finding.

The corollary for planning: when a criterion's polarity is `must_not`, the work it implies is the control, not the assertion. Budget for it when the criterion is written rather than when it is verified.
