/**
 * Part of **`@mutinex/cloud-infra`** – v2 name-first construction (Phase 2 DX).
 *
 * This module establishes the reusable **name-first** pattern that lets v2
 * components be constructed as `new CloudInfraX("name", { domain, ...config })`
 * instead of the v1 meta-first `new CloudInfraX(new CloudInfraMeta({...}))`.
 *
 * The whole job of this file is to map the ergonomic {@link NamingArgs} surface
 * onto an EXACTLY-equivalent {@link CloudInfraMeta}, so the resolved
 * `generateName` output is byte-identical to the meta-first path (Frozen
 * Contract F1 — see `docs/v2-redesign-notes.md` §2/§5, Move 1/Move 3). Components
 * keep computing names through `CloudInfraMeta` internally; only the public
 * constructor surface changes.
 *
 * ## The 5 generateName formulas (meta.ts `generateName`) → {@link NamingMode}
 *
 * | NamingMode             | meta flags set                       | formula              | example     |
 * | ---------------------- | ------------------------------------ | -------------------- | ----------- |
 * | `'conventional'` (def) | (none)                               | `prefix-name-loc`    | `p-api-au`  |
 * | `'no-location'`        | `omitLocation: true`                 | `prefix-name`        | `p-api`     |
 * | `'no-prefix'`          | `omitPrefix: true`                   | `name-loc`           | `api-au`    |
 * | `'literal'`            | `omitPrefix: true, omitLocation: true` | `name`             | `api`       |
 * | `{ preview: string }`  | `preview: <string>`                  | `prefix-name-hash7`  | `p-api-1a2` |
 *
 * `preview` is supplied as an OBJECT discriminator (`{ preview }`) rather than a
 * bare string so the caller-supplied preview token rides along with the mode.
 * In meta.ts, `preview` wins over every omit/location branch, matching F1.
 *
 * ## Scope (WS-DX1a foundation)
 *
 * This surface covers the SINGLE-NAME regional/global formula set — exactly the
 * single-resource components (Bucket is the proof; Account etc. follow) — PLUS
 * the **bulk / multi-name** set (`name: string[]` → `getNames()`), added via the
 * `resolveMeta(names: string[], args)` overload (DX2 bulk name-first sweep). The
 * `string[]` overload reuses the SAME domain/location/prefix/`namingModeToFlags`
 * mapping; only `name` differs, so a bulk meta-first caller and the equivalent
 * name-first caller yield an indistinguishable meta (F1). It does NOT yet
 * express:
 *   - the **zonal** instance formula (`getName(zone)` → `generateZonalName`,
 *     a distinct 6th naming surface).
 * That remains a deliberate follow-up sweep; the absence of a zonal `NamingMode`
 * will need widening before a zonal/multi-resource component adopts this
 * pattern. See WS-DX1 report.
 */

import { CloudInfraMeta } from '../meta';
import type { CloudInfraMetaInput } from '../meta/schemas';

/**
 * Discriminated union selecting which of the 5 `generateName` formulas a
 * name-first component should use.
 *
 * - `'conventional'` (default) → `prefix-name-loc`
 * - `'no-location'`            → `prefix-name`
 * - `'no-prefix'`              → `name-loc`
 * - `'literal'`                → `name`
 * - `{ preview: string }`      → `prefix-name-hash7(preview)`
 *
 * @see resolveMeta for the exact flag mapping.
 */
export type NamingMode =
  | 'conventional'
  | 'no-location'
  | 'no-prefix'
  | 'literal'
  | { preview: string };

/**
 * Name-first construction arguments shared by v2 single-name components.
 *
 * Everything here is naming metadata that v1 callers used to pass through a
 * hand-built {@link CloudInfraMeta}. A component's own config (Pulumi resource
 * args) is a SEPARATE argument — these are only the naming inputs.
 */
export interface NamingArgs {
  /**
   * Org domain (`au` | `us` | `gl`). Drives default region + the `domain` label.
   * Typed from the meta schema so an invalid domain is a COMPILE error, not a
   * deferred Zod runtime failure.
   */
  domain?: CloudInfraMetaInput['domain'];
  /**
   * Explicit GCP location: single region/zone, multi-region identifier, or a
   * two-element dual-region array. If omitted, the default region for `domain`
   * is used. Typed from the meta schema (same accepted set as meta-first).
   */
  location?: CloudInfraMetaInput['location'];
  /** Custom prefix; overrides the Pulumi-project-derived prefix. */
  prefix?: string;

  /* --- Flat naming flags (preferred v2 surface) ----------------------------
   *
   * These map 1:1 onto the same `CloudInfraMeta` flags the deprecated
   * {@link NamingMode} discriminator produced, so the resolved meta —
   * and therefore `generateName` — is byte-identical (Frozen Contract F1).
   *
   * | flat flags                              | formula             | example     |
   * | --------------------------------------- | ------------------- | ----------- |
   * | (none)                                  | `prefix-name-loc`   | `p-api-au`  |
   * | `omitLocation: true`                    | `prefix-name`       | `p-api`     |
   * | `omitPrefix: true`                      | `name-loc`          | `api-au`    |
   * | `omitPrefix: true, omitLocation: true`  | `name`              | `api`       |
   * | `preview: '<token>'`                    | `prefix-name-hash7` | `p-api-1a2` |
   *
   * `preview` wins over the omit flags (matching meta.ts), exactly as the
   * `{ preview }` mode did.
   */

  /** Omit the prefix segment from the generated name (`name-loc`). */
  omitPrefix?: boolean;
  /** Omit the location segment from the generated name (`prefix-name`). */
  omitLocation?: boolean;
  /**
   * Render a preview name (`prefix-name-hash7(preview)`); wins over the omit
   * flags, matching `meta.ts`.
   */
  preview?: string;

  /**
   * Which `generateName` formula to use. Defaults to `'conventional'`.
   *
   * @deprecated Use the flat {@link NamingArgs.omitPrefix} /
   * {@link NamingArgs.omitLocation} / {@link NamingArgs.preview} flags instead.
   * `naming` remains accepted as an alias and maps onto the identical meta
   * flags (resolved meta byte-identical, F1). When a flat flag is also
   * supplied, the flat flag takes precedence.
   * @see NamingMode
   */
  naming?: NamingMode;
}

/**
 * Translate a {@link NamingMode} into the exact `CloudInfraMeta` flag set that
 * produces the corresponding `generateName` formula (Frozen Contract F1).
 *
 * Returns ONLY the flag fields the mode maps to — the `omit*` booleans are left
 * `undefined` (i.e. falsy, exactly as a v1 caller who never set them) for modes
 * that don't need them, so the resolved meta is indistinguishable from a
 * hand-built one.
 */
function namingModeToFlags(mode: NamingMode | undefined): {
  omitPrefix?: boolean;
  omitLocation?: boolean;
  preview?: string;
} {
  // Default mode → conventional `prefix-name-loc` (no flags).
  if (mode === undefined || mode === 'conventional') {
    return {};
  }

  if (typeof mode === 'object') {
    // Preview: `prefix-name-hash7(preview)` (wins over omit/location in meta.ts).
    return { preview: mode.preview };
  }

  switch (mode) {
    case 'no-location':
      // `prefix-name`. meta.ts folds omitDomain || omitLocation into
      // shouldOmitLocation; omitLocation is the explicit, intent-revealing flag.
      return { omitLocation: true };
    case 'no-prefix':
      // `name-loc`.
      return { omitPrefix: true };
    case 'literal':
      // `name`.
      return { omitPrefix: true, omitLocation: true };
  }
}

/**
 * Resolve a name-first OR meta-first input into a {@link CloudInfraMeta}.
 *
 * This is the single bridge every name-first component uses. It is overloaded:
 *
 * - `resolveMeta(name: string, args: NamingArgs)` — name-first single: builds a
 *   `CloudInfraMeta` from `{ name, domain, location, prefix }` plus the flags
 *   the {@link NamingMode} maps to. Output is byte-identical (F1) to a
 *   hand-built meta with the equivalent flags.
 * - `resolveMeta(names: string[], args: NamingArgs)` — name-first multi/bulk:
 *   identical to the single overload except `name` is the supplied `string[]`.
 *   A bulk meta-first caller who passed `new CloudInfraMeta({ name: [...],
 *   domain, ... })` and a name-first caller passing the same array + the
 *   equivalent {@link NamingArgs} yield an INDISTINGUISHABLE meta (F1 →
 *   `getNames()`/`getInputName()` byte-identical).
 * - `resolveMeta(meta: CloudInfraMeta, _config?)` — meta-first (legacy/deprecated):
 *   returns the meta unchanged.
 *
 * The `_config` parameter on the meta-first overload exists only so callers can
 * forward their `(metaOrName, config)` argument pair uniformly; it is ignored.
 */
export function resolveMeta(name: string, args?: NamingArgs): CloudInfraMeta;
export function resolveMeta(names: string[], args?: NamingArgs): CloudInfraMeta;
export function resolveMeta(
  meta: CloudInfraMeta,
  _config?: unknown
): CloudInfraMeta;
export function resolveMeta(
  nameOrMeta: string | string[] | CloudInfraMeta,
  argsOrConfig?: NamingArgs | unknown
): CloudInfraMeta {
  // Meta-first: pass the existing meta straight through (no rebuild → identical).
  if (nameOrMeta instanceof CloudInfraMeta) {
    return nameOrMeta;
  }

  const args = (argsOrConfig as NamingArgs | undefined) ?? {};

  // Start from the flags the (deprecated) `naming` discriminator maps to, then
  // let the flat flags override. A `naming`-only caller therefore resolves to
  // the IDENTICAL meta as before (F1); a flat-flag caller gets the same flags
  // the equivalent mode would have set; a caller mixing both has the flat flag
  // win. Only flags the caller actually set are forwarded — unset `omit*`
  // booleans stay `undefined` (falsy, exactly as a v1 hand-built meta).
  const modeFlags = namingModeToFlags(args.naming);
  const flags: {
    omitPrefix?: boolean;
    omitLocation?: boolean;
    preview?: string;
  } = { ...modeFlags };
  if (args.omitPrefix !== undefined) flags.omitPrefix = args.omitPrefix;
  if (args.omitLocation !== undefined) flags.omitLocation = args.omitLocation;
  if (args.preview !== undefined) flags.preview = args.preview;

  // Name-first (single string OR multi-name string[]). The `name` field rides
  // through unchanged — a `string[]` populates `meta.getNames()`/`getInputName`
  // exactly as a hand-built bulk meta would.
  const metaInput: CloudInfraMetaInput = {
    name: nameOrMeta,
    ...(args.domain !== undefined ? { domain: args.domain } : {}),
    ...(args.location !== undefined ? { location: args.location } : {}),
    ...(args.prefix !== undefined ? { prefix: args.prefix } : {}),
    ...flags,
  };

  return new CloudInfraMeta(metaInput);
}

/**
 * The fixed set of {@link NamingArgs} keys that a name-first component splits
 * out of its combined args object before forwarding the remainder as the
 * component config. Centralised here so the {@link splitMetaArgs} helper and any
 * future consumer share ONE source of truth.
 *
 * Distinct from `MetaManagedField` in `config.ts`: this is the RUNTIME set
 * stripped off and routed to the meta; that is the TYPE-LEVEL set removed from
 * the public config surface. They overlap only on `location` and are
 * deliberately disjoint in purpose.
 */
const NAMING_ARG_KEYS = [
  'domain',
  'location',
  'prefix',
  'naming',
  // Flat naming flags (preferred v2 surface) — stripped alongside the legacy
  // `naming` discriminator so neither leaks into the forwarded component config.
  'omitPrefix',
  'omitLocation',
  'preview',
] as const satisfies readonly (keyof NamingArgs)[];

/**
 * Compile-time coupling between {@link NAMING_ARG_KEYS} and {@link NamingArgs}.
 *
 * The `satisfies` above guarantees every listed key IS a NamingArgs key (no
 * stray strings). This assertion closes the OTHER direction: it forces the
 * listed keys to cover EXACTLY `keyof NamingArgs`, so adding a new flag to
 * NamingArgs WITHOUT adding it to NAMING_ARG_KEYS becomes a COMPILE error here —
 * preventing the new flag from silently leaking through splitMetaArgs into a
 * component's forwarded config. `AssertExact<A, B>` resolves to `true` only when
 * A and B are mutually assignable, else to a descriptive error string the
 * `const _check: true = …` line then rejects.
 */
type AssertExact<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : { error: 'NAMING_ARG_KEYS is MISSING a NamingArgs key'; missing: Exclude<B, A> }
  : { error: 'NAMING_ARG_KEYS has an EXTRA key not in NamingArgs'; extra: Exclude<A, B> };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _namingArgKeysExhaustive: AssertExact<
  (typeof NAMING_ARG_KEYS)[number],
  keyof NamingArgs
> = true;

/**
 * Result of normalising a name-first OR meta-first constructor argument pair
 * into the uniform `(meta, config)` shape every name-first component uses.
 *
 * @typeParam TConfig The component's own (Pulumi-args) config type.
 */
export interface MetaArgsSplit<TConfig> {
  /** The resolved {@link CloudInfraMeta} (byte-identical between both paths). */
  meta: CloudInfraMeta;
  /**
   * The component config: for the name-first path this is the combined args with
   * the {@link NamingArgs} naming fields removed; for the meta-first path it is
   * the caller-supplied config unchanged.
   */
  config: TConfig;
}

/**
 * Hoisted, single-source implementation of the meta/name-first split that was
 * previously copy-pasted into every name-first component constructor.
 *
 * Behaviour is byte-identical to the inlined block it replaces:
 *
 * - **Name-first** (`nameOrMeta: string` — single — or `string[]` — multi/bulk):
 *   destructures the {@link NAMING_ARG_KEYS} out of the combined args and resolves
 *   the naming fields into a {@link CloudInfraMeta} via {@link resolveMeta} (same
 *   F1 `generateName` output). `rest` becomes `config`. The `string[]` arity feeds
 *   `resolveMeta(names, …)` so a bulk component's hand-inlined destructure is
 *   replaced by the SAME single source of truth as the single arity.
 * - **Meta-first** (`nameOrMeta: CloudInfraMeta`): returns the meta unchanged and
 *   the caller-supplied `argsOrConfig` as `config` (the legacy/deprecated path).
 *
 * The naming-field destructure uses the centralised {@link NAMING_ARG_KEYS} set,
 * so all name-first components strip EXACTLY the same keys — including the flat
 * `omitPrefix`/`omitLocation`/`preview` flags, which a hand-inlined
 * `{ domain, location, prefix, naming, ...rest }` destructure would have LEAKED
 * into the forwarded component config.
 *
 * @typeParam TConfig The component's own config type (the non-naming remainder).
 * @param nameOrMeta   The first constructor arg: a single name (`string`), a set
 *                     of names (`string[]`), or a {@link CloudInfraMeta}.
 * @param argsOrConfig The second constructor arg: the combined name-first args
 *                     (`NamingArgs` folded over the config, with any naming-named
 *                     config keys yielding to the {@link NamingArgs} typing) OR a
 *                     bare meta-first `TConfig`.
 *
 * The name-first arm of the parameter type is `NamingArgs &
 * Omit<TConfig, keyof NamingArgs>` rather than a bare `NamingArgs & TConfig`:
 * dropping any `TConfig` keys that collide with {@link NamingArgs} (e.g. a
 * component whose config independently declares `location` with a DIFFERENT type)
 * keeps the intersection satisfiable. Runtime behaviour is unchanged — the same
 * {@link NAMING_ARG_KEYS} are stripped regardless of the static type.
 */
export function splitMetaArgs<TConfig>(
  nameOrMeta: string | string[] | CloudInfraMeta,
  argsOrConfig: (NamingArgs & Omit<TConfig, keyof NamingArgs>) | TConfig
): MetaArgsSplit<TConfig> {
  if (typeof nameOrMeta === 'string' || Array.isArray(nameOrMeta)) {
    const combined = { ...(argsOrConfig as NamingArgs & TConfig) } as Record<
      string,
      unknown
    >;
    const namingArgs: NamingArgs = {};
    for (const key of NAMING_ARG_KEYS) {
      if (key in combined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (namingArgs as any)[key] = combined[key];
        delete combined[key];
      }
    }
    // `resolveMeta`'s string and string[] overloads both resolve the identical
    // NAMING_ARG_KEYS (stripped above); the cast picks the array overload when
    // `nameOrMeta` is a `string[]` and is otherwise a no-op for `string`.
    return {
      meta: resolveMeta(nameOrMeta as string[], namingArgs),
      config: combined as TConfig,
    };
  }
  return {
    meta: nameOrMeta,
    config: argsOrConfig as TConfig,
  };
}
