/**
 * The two host plugin shapes, named side by side — the whole of what the second SDK buys.
 *
 * **This module exists so that both hosts are in the type graph, and it contains no runtime code
 * at all.** Every declaration below is erased before evaluation: by Node's type-stripper when the
 * plugin loads and by `tsc` under `verbatimModuleSyntax` when the check runs. So `dependencies`
 * stays empty, nothing is fetched for a user, and the cost of typing against a second host is paid
 * entirely at development time — which is NFR2 and is the argument ADR 02-05 rests on.
 *
 * **The two SDKs are one package published under one name at two versions**, so they cannot both
 * be declared under their own name; `@opencode-ai/plugin-v1` is an npm alias onto
 * `@opencode-ai/plugin@1.18.25` and the specifier is the only thing distinguishing them. That is
 * why the module sweep judges type-only specifiers by name against `SDK_TYPE_SURFACE`: a registrar
 * typed against the wrong host's SDK type-checks cleanly and is wrong, and nothing else in this
 * project can see the mistake.
 *
 * **The shapes are genuinely different, which is the point rather than a detail.** v1 hands the
 * host a function it calls with its input; v2 hands it an object the host calls `setup` on. A
 * single registrar cannot serve both, and that is what epic 02-01 story 2 is for.
 */

import type { Plugin as V2 } from '@opencode-ai/plugin';
import type { Plugin as V1 } from '@opencode-ai/plugin-v1';

/** OpenCode v2's plugin: an object carrying `id` and `setup`, which the host invokes. */
export type V2Plugin = V2.Plugin;

/** OpenCode v1's plugin: a function of `(input, options?)` returning the hooks it wants. */
export type V1Plugin = V1;

/** `true` when `T` is callable. Used below to hold each host to the shape it actually has. */
type IsCallable<T> = T extends (...args: never[]) => unknown ? true : false;

/** Fails to compile unless `T` is `true`, which is how the two declarations below are controls. */
type Assert<T extends true> = T;

/**
 * The compile-time control on the alias, and it is the reason this file is worth its existence
 * beyond the two re-exports.
 *
 * If the alias were mis-declared — pointed at the beta, or resolved to the same build as the entry
 * beside it — both names would denote one shape and one of these two lines would stop compiling.
 * Without them the type graph would contain the same SDK twice and `tsc --noEmit` would exit zero
 * saying so, which is the false pass this project keeps rediscovering in its other form: an empty
 * reading nobody proved could be non-empty.
 */
export type V1IsCallable = Assert<IsCallable<V1Plugin>>;

/** The other half: v2's plugin is an object, so a callable there means the versions have collapsed. */
export type V2IsNotCallable = Assert<IsCallable<V2Plugin> extends false ? true : false>;
