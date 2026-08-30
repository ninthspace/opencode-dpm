# Ask the host, not a test's idea of the host

**Number**: 05  
**Status**: pending  

**Type**: architecture  
**Scope**: architect, do  

## Ask the host, not a test's idea of the host

For any question about what a running OpenCode host actually holds, write a throwaway probe plugin that reports the registry from inside the host — and write it **first**, rather than after exhausting the CLI. Across this port the probe was the reliable instrument every time it was reached for, and the CLI produced false "it is not loading" conclusions repeatedly.

Host facts that cost time and that a probe answers directly:

- **Plugins load lazily.** A freshly started server has registered nothing until a request asks it to, so a probe that starts and reads immediately sees an empty world.
- **`ctx.skill.transform(cb)` returns a `Registration` carrying only `dispose`** — not the callback's value. A probe that reads the return value gets an empty registry, which is indistinguishable from a host that registered nothing.
- **CLI listings are unreliable for the first second or two after `service start`.** `mcp list` and `plugin list` report nothing, then report correctly and stably, while the log shows the plugin loading throughout. Run any CLI listing twice before believing it.
- **A misconfiguration announces itself in the host log as a normalisation diagnostic**, not as an error at the CLI. The wrong config key, or the right key with the wrong value shape, is accepted and discarded silently. Read the log before concluding the code is wrong.
- **A duplicate plugin id kills the entire plugin load**, not just the duplicate — so a working plugin presents as a hung one, and a scratch fixture left behind by earlier work is the usual cause.

Two habits that make the probe trustworthy. Write its report **incrementally** — after the registry read, after each row — so a hang produces evidence about where rather than an empty file indistinguishable from never having run. And **record the raw shape before filtering**: a probe that filters what it records can report an absence that is an artefact of its own filter, which reads exactly like a defect in the thing being probed.
