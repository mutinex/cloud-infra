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
 * Name-first construction arguments shared by all v2 components.
 *
 * Everything here is naming metadata that v1 callers used to pass through a
 * hand-built {@link CloudInfraMeta}. A component's own config (Pulumi resource
 * args) is a SEPARATE argument — these are only the naming inputs.
 */
export interface NamingArgs {
  /** Org domain (`au` | `us` | `gl`). Drives default region + the `domain` label. */
  domain?: string;
  /**
   * Explicit GCP location: single region/zone, multi-region identifier, or a
   * two-element dual-region array. If omitted, the default region for `domain`
   * is used.
   */
  location?: string | string[];
  /** Custom prefix; overrides the Pulumi-project-derived prefix. */
  prefix?: string;
  /**
   * Which `generateName` formula to use. Defaults to `'conventional'`.
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
 * - `resolveMeta(name: string, args: NamingArgs)` — name-first: builds a
 *   `CloudInfraMeta` from `{ name, domain, location, prefix }` plus the flags
 *   the {@link NamingMode} maps to. Output is byte-identical (F1) to a
 *   hand-built meta with the equivalent flags.
 * - `resolveMeta(meta: CloudInfraMeta, _config?)` — meta-first (legacy/deprecated):
 *   returns the meta unchanged.
 *
 * The `_config` parameter on the meta-first overload exists only so callers can
 * forward their `(metaOrName, config)` argument pair uniformly; it is ignored.
 */
export function resolveMeta(name: string, args?: NamingArgs): CloudInfraMeta;
export function resolveMeta(
  meta: CloudInfraMeta,
  config?: unknown
): CloudInfraMeta;
export function resolveMeta(
  nameOrMeta: string | CloudInfraMeta,
  argsOrConfig?: NamingArgs | unknown
): CloudInfraMeta {
  // Meta-first: pass the existing meta straight through (no rebuild → identical).
  if (nameOrMeta instanceof CloudInfraMeta) {
    return nameOrMeta;
  }

  const args = (argsOrConfig as NamingArgs | undefined) ?? {};
  const flags = namingModeToFlags(args.naming);

  const metaInput: CloudInfraMetaInput = {
    name: nameOrMeta,
    ...(args.domain !== undefined ? { domain: args.domain as never } : {}),
    ...(args.location !== undefined
      ? { location: args.location as never }
      : {}),
    ...(args.prefix !== undefined ? { prefix: args.prefix } : {}),
    ...flags,
  };

  return new CloudInfraMeta(metaInput);
}
