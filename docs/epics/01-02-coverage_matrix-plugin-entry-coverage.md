# Coverage: Plugin entry and MCP registration

**Number**: 01-02  
**Source epic**: 01-02  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR1 | the MCP server registered and connected | In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state. | Story 1 | `[manual]` | ✓ |
| 2 | FR1 | `opencode2 plugin add github:ninthspace/opencode-dpm` — and later the npm form — yields a working DPM | The published package's manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree. | Story 1 | `[integration]` | ✓ |
| 3 | FR1 | nothing further for the user to copy into the project | must NOT — Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step. | Story 1 | `[integration]` | ✓ |
| 4 | FR2 | The plugin registers the bundled server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. | The plugin's entry object registers the bundled MCP server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. | Story 1 | `[integration]` | ✓ |
| 5 | FR2 | Tool behaviour and schemas carry over from v0.7.0 unchanged. | The advertised tool set and every tool schema match v0.7.0's, compared against a stored snapshot of the tool surface. | Story 2 | `[integration]` | ✓ |
| 6 | FR3 | tool names take v2's effective naming | The effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — is established against a running beta host. | Story 2 | `[manual]` | ✓ |
| 7 | FR3 | Skill prose is revised wherever it names host mechanics | The established naming is recorded as a written section on this epic before any skill prose is rewritten. | Story 2 | `[integration]` | ✓ |
| 8 | FR3 | with `location` pointing into the installed package so directory-based skills keep their supporting files | A registered skill's supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it. | Story 3 | `[manual]` | ✓ |
| 9 | FR13 | The architectural seam that makes it selectable at registration time is decided here and is not deferred. | The set of skills registered is computed from a profile selection resolved at registration time. | Story 1 | `[unit]` | ✓ |
| 10 | FR13 | a reduced model-facing surface selected by plugin option | must NOT — The plugin entry hardcodes the skill list. | Story 1 | `[unit]` | ✓ |
| 11 | NFR1 | The only entry under `dependencies` is `@opencode-ai/plugin`. | The package's `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install. | Story 4 | `[unit]` | ✓ |
| 12 | NFR1 | The SDK is therefore taken as a type-only import, sits under `devDependencies`, and `dependencies` stays empty. | The package's `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install. | Story 4 | `[unit]` | ✓ |
| 13 | NFR1 | no native modules and no install-time compilation | must NOT — A `.node` binary, or a compile step, appears anywhere in the production install tree. | Story 4 | `[integration]` | ✓ |
| 14 | NFR3 | The plugin pins `@opencode-ai/plugin@beta` | The plugin dependency is pinned to the exact version the `beta` dist-tag resolves to, rather than to the floating tag itself. | Story 4 | `[unit]` | ✓ |
| 15 | ENVR4 | an OpenCode v2 beta CLI on the contributor's machine | `opencode2 --version` on the contributor's machine reports a `0.0.0-beta-*` build matching the `beta` dist-tag of `@opencode-ai/plugin`. | Story 1 | `[manual]` | ✓ |
| 16 | ENVR5 | installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised | In a scratch project, one install produces a connected MCP server whose advertised tool names match the naming recorded in story 2, and a registered sample skill resolves its supporting files from the package location. | Story 5 | `[manual]` | ✓ |
| 17 | ENVX1 | native compilation must not be required | A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output. | Story 4 | `[integration]` | ✓ |
| 18 | ENVR9 | the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host's registries | In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state. | Story 1 | `[manual]` | ✓ |
