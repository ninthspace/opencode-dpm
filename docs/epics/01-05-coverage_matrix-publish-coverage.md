# Coverage: Publish and release verification

**Number**: 01-05  
**Source epic**: 01-05  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR1 | and later the npm form | The package publishes to npm at version 0.1.0. | Story 1 | `[integration]` |  |
| 2 | FR1 | yields a working DPM: the MCP server registered and connected, all skills advertised, and nothing further for the user to copy into the project | Installing the published version into a fresh project by the documented command leaves the MCP server connected and all twenty-three skills advertised, with no further user action. | Story 2 | `[manual]` |  |
| 3 | FR1 | yields a working DPM | One skill runs end to end from the published install, in a clean environment, installed by version. | Story 2 | `[manual]` |  |
| 4 | FR1 | and later the npm form | must NOT — The release is verified from the working tree rather than from the downloaded artefact. | Story 2 | `[manual]` |  |
| 5 | FR3 | with `location` pointing into the installed package so directory-based skills keep their supporting files | The published tarball contains the plugin entry, all twenty-three skill directories, `shared/`, and the five executables. | Story 1 | `[integration]` |  |
| 6 | FR3 | so directory-based skills keep their supporting files | must NOT — The published tarball omits a file a registered skill needs at runtime. | Story 1 | `[integration]` |  |
| 7 | ENVX4 | network access must not be required at runtime | A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt. | Story 3 | `[integration]` |  |
| 8 | ENVX5 | a database service must not be required | Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle. | Story 3 | `[integration]` |  |
| 9 | ENVX6 | Claude Code artefacts must not be required | The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation. | Story 3 | `[integration]` |  |
