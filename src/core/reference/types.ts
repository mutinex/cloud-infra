/**
 * @module @mutinex/cloud-infra/core/reference
 */

import type * as pulumi from '@pulumi/pulumi';

/**
 * Defines the context for a `CloudInfraReference` instance, specifying the
 * geographical or logical domain to which the reference is scoped.
 */
export interface ReferenceDomain {
  /**
   * The domain identifier (e.g., "au", "us", "gl"). This determines which
   * top-level key to use when looking up outputs in the referenced stack.
   */
  domain: string;
}

/**
 * Configuration options for creating a {@link CloudInfraReference} instance.
 */
export interface ReferenceWithDomainConfig {
  /**
   * The domain identifier (e.g., "au", "us", "gl") to scope the reference to.
   */
  domain: string;

  /**
   * The fully-qualified name of the Pulumi stack to reference, in the format
   * `organization/project/environment`. For example, `mutiny-group/base/prd`.
   */
  stack: string;

  /**
   * The specific output key (version) to retrieve from the stack.
   * This corresponds to the version key used by the `CloudInfraOutput`
   * in the source stack.
   * @default "v1"
   */
  outputKey?: string;
}

/**
 * Configuration options for creating a {@link ReferenceWithoutDomain} instance.
 */
export interface ReferenceWithoutDomainConfig {
  /**
   * The fully-qualified name of the Pulumi stack to reference, in the format
   * `organization/project/environment`. For example, `mutiny-group/base/prd`.
   */
  stack: string;
}

/**
 * Type representing the structure of stack outputs
 */
export interface StackOutputs {
  [domain: string]: {
    [resourceType: string]: {
      [resourceName: string]: ResourceOutput;
    };
  };
}

/**
 * The flat KEYED-MAP output wire (`CloudInfraOutput.getFlatOutputs()`), as seen
 * on the READ side after JSON round-trip: a single-level map from a composed
 * key (`<domain>.<service>[.<region>].<name>.<field>`) to a plain scalar
 * string. Each composed key can also be a TOP-LEVEL stack output when the
 * producer spreads the map onto its module exports
 * (`Object.assign(exports, getFlatOutputs())`), enabling a one-hop
 * `pulumi.StackReference.requireOutput("<key>")`.
 *
 * `CloudInfraReference` (flat mode) re-assembles a {@link ResourceOutput} by
 * grouping every key that shares the leading
 * `<domain>.<service>[.<region>].<name>` prefix.
 */
export type FlatStackOutput = Record<string, string>;

/**
 * Type representing a resource output with common properties
 */
export interface ResourceOutput {
  id?: string;
  name?: string;
  email?: string;
  member?: string;
  projectId?: string;
  version?: string;
  // [key: string]: unknown;
}

/**
 * Options accepted by the intuitive {@link CloudInfraReference} constructor when
 * the stack is supplied positionally:
 *
 * ```ts
 * new CloudInfraReference("org/project/env", { domain: "au" });
 * ```
 *
 * Both `domain` and `outputKey` are optional. When `domain` is omitted the
 * reference operates in domain-optional mode (the former
 * {@link ReferenceWithoutDomain} behaviour): outputs are read as flat
 * `root[name]` string values rather than the nested `root[domain][type][name]`
 * wire.
 */
export interface ReferenceOptions {
  /**
   * The domain identifier (e.g., "au", "us", "gl") to scope the reference to.
   * Omit for domain-optional (flat-output) resolution.
   */
  domain?: string;

  /**
   * The specific output key (version) to retrieve from the stack. Corresponds
   * to the version key used by `CloudInfraOutput` in the source stack.
   * @default "v1"
   */
  outputKey?: string;

  /**
   * When `true`, resolve against the NEW flat, self-describing emission
   * (`CloudInfraOutput.getFlatOutputs()` → a `FlatOutputRecord[]`) instead of
   * the legacy nested `root[domain][type][name]` wire. This is the Move 4 flat
   * reader: records are matched by `key`, with optional `{ type, domain }`
   * disambiguators (cross-record scan semantics mirror the nested cross-type
   * scan). The `outputKey` still selects which stack output array to read.
   *
   * Mutually distinct from domain-optional mode (which reads flat `root[name]`
   * STRINGS); flat mode reads an ARRAY of structured records.
   * @default false
   */
  flat?: boolean;
}

/**
 * Disambiguators for {@link CloudInfraReference.get}. Only required when a bare
 * `name` is ambiguous across resource types, or to override the reference's
 * configured domain for a single lookup.
 */
export interface ReferenceGetOptions {
  /**
   * The resource type — a short alias (e.g. "sa", "bucket") or a full Pulumi
   * type (e.g. "gcp:serviceaccount:Account"). Used to disambiguate a `name`
   * that exists under more than one type.
   */
  type?: string;

  /**
   * Overrides the reference's configured domain for this single lookup.
   */
  domain?: string;
}

/**
 * The record returned by {@link CloudInfraReference.get}. Each property is a
 * lazy `pulumi.Output<string>` that resolves the corresponding field from the
 * referenced stack and throws a helpful error at apply time if the field is
 * absent. `identifier` is a synchronous, deterministic string (Frozen
 * Contract F4) — it does not touch the Pulumi runtime.
 */
export interface ReferenceRecord {
  /** The resource's `id`, as a lazy `pulumi.Output<string>`. */
  readonly id: pulumi.Output<string>;
  /** The resource's `name`, as a lazy `pulumi.Output<string>`. */
  readonly name: pulumi.Output<string>;
  /** The resource's `email`, as a lazy `pulumi.Output<string>`. */
  readonly email: pulumi.Output<string>;
  /** The resource's `member`, as a lazy `pulumi.Output<string>`. */
  readonly member: pulumi.Output<string>;
  /** The resource's `projectId`, as a lazy `pulumi.Output<string>`. */
  readonly projectId: pulumi.Output<string>;
  /** The resource's `version`, as a lazy `pulumi.Output<string>`. */
  readonly version: pulumi.Output<string>;
  /**
   * The deterministic identifier string for this resource (Frozen Contract
   * F4). Format: `${proj}-${name}-${env}-${domain}` (or `${proj}-${name}-${env}`
   * in domain-optional mode).
   */
  readonly identifier: string;
  /**
   * The full, raw resource object as a `pulumi.Output<ResourceOutput>` — an
   * escape hatch for properties without a dedicated field.
   */
  readonly raw: pulumi.Output<ResourceOutput>;
}
