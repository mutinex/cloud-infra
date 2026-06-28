/**
 * Part of **`@mutinex/cloud-infra`** – v2 component config policy (Phase 2 DX).
 *
 * A single shared helper type that expresses the uniform "the component manages
 * these fields, you don't set them on the config" policy. Components derive their
 * Pulumi-resource args from a GCP `*Args` type but MANAGE a fixed set of fields
 * themselves — the generated `name`, the region/zone (from `CloudInfraMeta`), and
 * (where applicable) `project`. Leaking those raw on the config type invites
 * callers to pass values the component then silently ignores or overrides.
 *
 * {@link ComponentConfig} strips that meta-managed set and re-adds an OPTIONAL
 * `project` (the one meta-managed field a caller may still legitimately want to
 * pin explicitly — components forward it unchanged when present).
 *
 * This is a TYPE-ONLY tightening: applying it changes NO runtime behaviour and
 * NO emitted resource. It only removes fields from the public config surface that
 * the component never honoured as caller input in the first place.
 */
import type * as pulumi from '@pulumi/pulumi';

/**
 * The fixed set of resource-arg fields a v2 component manages itself (derived
 * from `CloudInfraMeta`) and therefore removes from its public config surface.
 *
 * - `name`     – the generated resource name (`meta.getName()`).
 * - `location` – meta location input (naming); never a raw resource field here.
 * - `region`   – derived from `meta.getRegion()`.
 * - `zone`     – derived from the meta zone / zonal-name logic. NB: the zonal
 *               naming sweep is a deliberate follow-up (see `naming.ts` header),
 *               so for today's flat/regional adopters this Omit of an absent
 *               `zone` is inert — the field is listed for forward-consistency.
 * - `project`  – meta-managed; re-added as OPTIONAL via {@link ComponentConfig}.
 *
 * Distinct from the `NAMING_ARG_KEYS` set in `naming.ts`: that set is the RUNTIME
 * list of {@link NamingArgs} keys `splitMetaArgs` strips off and routes to the
 * meta (`domain`/`location`/`prefix`/`naming`); THIS set is the TYPE-LEVEL list
 * of resource-arg fields removed from the public config surface. They overlap
 * only on `location` and are deliberately disjoint in purpose.
 */
export type MetaManagedField = 'name' | 'project' | 'location' | 'region' | 'zone';

/**
 * Tightens a raw GCP `*Args` type into a CloudInfra component config: removes the
 * {@link MetaManagedField} set the component manages, then re-adds an optional
 * `project` (the single meta-managed field a caller may still pin; forwarded
 * unchanged when present).
 *
 * @typeParam T The underlying GCP resource args type (e.g.
 *   `gcp.compute.SubnetworkArgs`).
 *
 * @example
 * ```ts
 * export type CloudInfraSubnetConfig = ComponentConfig<gcp.compute.SubnetworkArgs>;
 * ```
 */
export type ComponentConfig<T> = Omit<T, MetaManagedField> & {
  /** Optional explicit GCP project; forwarded to the resource unchanged. */
  project?: pulumi.Input<string>;
};
