# Plugin entry and MCP registration

**Number**: 02  
**Source epic**: 01-02  
**Status**: complete  

## Observations

- **A duplicated reading fails silently in the direction of a false report, and this epic hit that shape six times.** Four separate readings of the import graph existed and only one knew `import type` is erased; the `.node` sweep walked `node_modules` and read a dev package's prebuilt as something dpm ships; CI's grep matched the *name* `node-gyp-build-optional-packages` rather than the act of compiling; `plugin.test.js` carried a private copy of the `package.json` read that `sources.js` exists to be. None of these was a broken property — every one was a second reading that had not been taught what the first had learned, and each failed by reporting a problem that did not exist or missing one that did.

**Why it matters more here than in ordinary code**: a test's job is to be the thing that notices, so a reading that has silently stopped noticing is the one defect the suite cannot catch. Consolidating onto one reader fixed six failures at their source in a single edit, and the two remaining copies were only found because a story happened to touch them.

**How to apply**: when a helper is written to end a duplication, migrate every caller in the same change, and when a shared reader already exists, treat a private copy of the same read as a defect on sight rather than as style. Before writing an assertion over an artefact, grep for who else reads that artefact.

- **Ask the host what it holds; do not ask a test what it thinks the host holds — and do not believe the host's CLI on the first answer.** A throwaway probe plugin that writes `ctx.skill.transform(draft => draft.list())`, `ctx.mcp.transform(draft => draft.list())` and `ctx.tool.transform(draft => draft.list())` to a file was the instrument that answered four separate questions this epic could not otherwise settle: the rendered tool-name form and its character substitution, whether `location` and `content` are stored verbatim, the full registered set, and whether a reload duplicates.

Against that, `opencode2 mcp list` and `plugin list` produced two false "it is not loading" conclusions, because both report nothing for a second or two after `service start` while the log shows the plugin loading throughout. Three CLI and HTTP routes to the same information returned HTML, nothing, or a schema-validation failure on a hand-built `Tool.Context`.

**How to apply**: for any question about a running host's registry, write the probe first rather than after exhausting the CLI. Run any CLI listing twice before believing it. And when the answer disagrees with expectation, read the host's log before concluding the code is wrong — every genuine misconfiguration in this epic announced itself there as a normalisation diagnostic while the CLI stayed silent.

- **A specification written before the dependency was opened carries assumptions into every story that quotes it, and amending one copy does not amend the others.** Four criteria and one requirement across three stories were amended in this epic, all from the same discovery — `Plugin.define` is `define(plugin) { return plugin }`, so the SDK is a type-only import and `dependencies` stays empty. NFR1 was amended in story 1; its two copies in story 4's criteria sat unamended for three stories, and a coverage row was still quoting the sentence that had been amended away, which renders in the matrix as a verified binding to text the requirement no longer contains.

The second family was the same shape from a different source: story 4's "pinned to the `beta` tag" (a tag is not a pin), and story 2's naming criteria written against Claude Code's `mcp__plugin_<plugin>_<server>__` form. Every amendment had a citation and none was a relaxation — NFR1's headline got *stronger*, from one runtime dependency to none.

**How to apply**: after amending a requirement, immediately ask what else quotes it — `list_coverage` on the requirement names every binding, and a bound fragment that is no longer a substring of the requirement is a broken binding whatever its verified date says. Before building against a criterion that names a mechanism rather than a property, check the mechanism still exists; retro 01 flagged that pattern and it recurred here three times.

- **Before generating an expected value, look for a copy of the thing being ported — and before recording a manual check as passed, look for what would have shown it failing.** Two halves of one discipline, and both changed a result in this epic.

The oracle: criterion "match v0.7.0 against a stored snapshot" invited generating the snapshot from the port, which is a self-portrait that passes on the day it is written and through any consistent drift afterwards. The released v0.7.0 was installed on the machine, so its `bin/dpm-mcp.js` was run and its real `tools/list` reply captured — 183 tools, byte-identical at 168,465 bytes. One command, and a far stronger claim.

The control: the reload check first "passed" by touching the watched entry file, which left the registry unchanged — but the log showed no reload had happened, so nothing had been measured. Restarting the service and counting `loading plugin` lines gave 2, and only then did "55 skills, 23 dpm, 0 duplicates" mean anything. The same shape appeared in the substitution check, where a search for the replaced string matched inside the absolute path that replaced it and reported 23 failures against a set with none.

**How to apply**: for a port, the previous version is an oracle and is usually still installed. For any manual check, name the evidence that the event under test actually occurred, and state it beside the result — a count in a log, a control write, a planted breach. An absence is only an observation when something was watching.
