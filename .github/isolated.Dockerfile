# The disposable isolated environment — ENVR12.
#
# **Its value is what it does not have.** Two of this specification's restrictions are absences —
# ENVX1 says native compilation must not be required, ENVX4 says network access must not be — and an
# absence cannot be shown on a developer's machine, which has a compiler and a network and would
# satisfy both by inspection. So this builds an environment that genuinely lacks them and runs the
# project inside it.
#
# Two targets, because the two checks need different amounts installed:
#
# - `bare` has Node 24 and git and **no `node_modules`**. The plugin declares no runtime
#   dependencies (NFR1), so the server runs here — and a clean install can be performed here, with
#   no compiler and no Python present, which is what ENVX1 asks to see.
# - `installed` adds `npm ci`, because `tsc` comes from `devDependencies` (ENVR3) and the suite
#   spawns it.
#
# **Node arrives as the official tarball, not from a `node:` base image**, so the "no toolchain
# present" state is a real state this file passes through rather than one asserted about an image
# that never had it. The check below runs before the install and fails the build if it is not true.
#
# git is installed and is not a language toolchain: the suite's fixtures init repositories, commit
# through the pre-commit hook and read `git ls-files`, and `src/merge/main.ts` shells out to git by
# design. Removing it would not make the environment purer, it would make the suite unrunnable.

FROM debian:bookworm-slim AS bare

ARG NODE_VERSION=24.20.0

# The control, before anything is added: if the base image already carries a runtime or a compiler,
# nothing built on it can show that neither is needed. `exit 1` here fails the build.
RUN for tool in node npm npx python python3 cc gcc g++ node-gyp; do \
      if command -v "$tool" >/dev/null 2>&1; then \
        echo "$tool is present in the base image, so this environment shows nothing" >&2; \
        exit 1; \
      fi; \
    done

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      -o /tmp/node.tar.xz \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
 && rm /tmp/node.tar.xz \
 && node --version \
 && npm --version

# Still absent after the install, and named so a base image that grows one is caught rather than
# tolerated. ENVX1 is about what a *clean install* needs, and this is the state it starts from.
RUN for tool in cc gcc g++ python python3 node-gyp; do \
      if command -v "$tool" >/dev/null 2>&1; then \
        echo "$tool arrived with node, so the clean-install check would prove nothing" >&2; \
        exit 1; \
      fi; \
    done

# An identity, because the suite's fixtures commit. They set their own on each repository they
# create; this covers anything that does not, and keeps a failure from reading as a missing config.
RUN git config --global user.email "ci@example.invalid" \
 && git config --global user.name "CI" \
 && git config --global init.defaultBranch main \
 && git config --global --add safe.directory '*'

WORKDIR /dpm

# `.dockerignore` keeps the host's `node_modules` out — copying a macOS install into a Linux
# container would defeat the clean-install check by having already done the install.
COPY . .

FROM bare AS installed

RUN npm ci
