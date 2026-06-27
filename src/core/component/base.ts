/**
 * Part of **`@mutinex/cloud-infra`** – v2 ComponentResource pathway (PROTOTYPE).
 *
 * `CloudInfraComponent` is a thin shared base on top of
 * {@link pulumi.ComponentResource}. Its job is to give every v2 component:
 *
 *   1. A real Pulumi component node in the resource graph (so children can be
 *      parented under it and surfaced as a logical unit).
 *   2. A small, explicit API for wiring children correctly:
 *        - {@link withLabels} merges the uniform org labels into a child's
 *          ARGS (only call it for children whose GCP type supports `labels`);
 *        - {@link childOpts} / {@link nestedChildOpts} encode the two
 *          v1 → component alias recipes so conversions cannot get aliasing wrong.
 *
 * Labels live in each child's own args now (not a parent transformation), so the
 * Pulumi transformation-inheritance gotcha (redesign-notes §8) no longer applies:
 * a label-less child simply isn't passed through `withLabels`, so it can never
 * receive a `labels` key it would reject.
 *
 * This is runtime-light: the base creates no GCP resources itself.
 */

import * as pulumi from '@pulumi/pulumi';

/**
 * The baseline org labels merged into every label-supporting child of a
 * `CloudInfraComponent` (via {@link withLabels}).
 *
 * - `env`        – the active Pulumi stack ({@link pulumi.getStack}).
 * - `service`    – the caller-supplied component (input) name.
 * - `domain`     – the org domain (`au` | `us` | `gl`), supplied via args.
 * - `managed-by` – constant marker so org tooling can find cloud-infra assets.
 */
export interface CloudInfraComponentLabels {
  domain: string;
  env: string;
  service: string;
  'managed-by': string;
}

/**
 * Arguments accepted by the `CloudInfraComponent` base constructor.
 *
 * Concrete components pass their own (wider) args object; the base only needs
 * the pieces required to compute the org labels.
 */
export interface CloudInfraComponentBaseArgs {
  /** Org domain used for labelling (`au` | `us` | `gl`). Defaults to `gl`. */
  domain?: string;
}

/** A child-args shape that may already carry caller-supplied `labels`. */
type WithOptionalLabels = {
  labels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
};

/**
 * Shared base class for v2 cloud-infra ComponentResources.
 *
 * @typeParam typeToken The fully-qualified Pulumi type token, e.g.
 *   `"cloud-infra:cloudrunservice:CloudRunService"`.
 */
export abstract class CloudInfraComponent extends pulumi.ComponentResource {
  /** The resolved, generated resource name shared by the component's children. */
  protected readonly generatedName: string;

  /**
   * The baseline org labels for this component, merged into label-supporting
   * children via {@link withLabels}. EXACT same key set/values as the v1 label
   * transformation (`domain` / `env` / `service` / `managed-by`).
   */
  protected readonly orgLabels: CloudInfraComponentLabels;

  /**
   * @param typeToken      Fully-qualified Pulumi component type token.
   * @param name           The caller-supplied (input) name. Also used as the
   *                       `service` label value.
   * @param generatedName  The fully-resolved generated resource name (computed
   *                       by the concrete component, typically via
   *                       `CloudInfraMeta`). Exposed via {@link getGeneratedName}.
   * @param args           Base args (currently just `domain`).
   * @param opts           Component resource options.
   */
  constructor(
    typeToken: string,
    name: string,
    generatedName: string,
    args: CloudInfraComponentBaseArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // ComponentResources register with empty inputs ({}) – their state lives
    // in their children, not in the component node itself.
    super(typeToken, name, {}, opts);

    this.generatedName = generatedName;
    this.orgLabels = {
      domain: args.domain ?? 'gl',
      env: pulumi.getStack(),
      service: name,
      'managed-by': 'cloud-infra',
    };
  }

  /**
   * The resolved generated name shared by this component's children.
   *
   * NB: named `getGeneratedName` (not `getName`) so concrete components are free
   * to expose their own `getName()` with a different return type — e.g. the
   * Cloud Run component's frozen public `getName(): pulumi.Output<string>`.
   */
  public getGeneratedName(): string {
    return this.generatedName;
  }

  /**
   * Merge the org labels into a child's ARGS.
   *
   * Call this **only** for children whose GCP type supports a `labels` input
   * (see the validated label-support map in redesign-notes §9b). Children
   * without label support must pass their args through unchanged — passing a
   * label-less type through `withLabels` would inject a `labels` key the
   * provider rejects ("Invalid or unknown key").
   *
   * Merge semantics: `{ ...orgLabels, ...(args.labels ?? {}) }`. The org labels
   * provide a uniform floor; any label the caller already set on the child wins.
   * Because labels live in the child's own args (not an inherited parent
   * transformation), a label-less sibling/descendant can never receive them.
   */
  protected withLabels<T extends WithOptionalLabels>(
    args: T
  ): T & { labels: pulumi.Input<Record<string, pulumi.Input<string>>> } {
    const existing = args.labels ?? {};
    return {
      ...args,
      labels: { ...this.orgLabels, ...existing },
    };
  }

  /**
   * Child options for a resource that was at the v1 STACK ROOT (no parent) and
   * is now parented under this component.
   *
   * Parents the child to `this` AND aliases it back to its old root-level URN
   * (`{ parent: pulumi.rootStackResource }`, the type-correct equivalent of
   * `noParent` in this pinned Pulumi version) so an existing deployment migrates
   * IN-PLACE (update, not destroy+recreate). See redesign-notes §9/§9c.
   *
   * @param extra Additional child options merged in (e.g. `protect`,
   *   `deleteBeforeReplace`, `provider`, `dependsOn`). A caller-supplied
   *   `parent` or `aliases` here OVERRIDES the defaults.
   */
  protected childOpts(
    extra: pulumi.CustomResourceOptions = {}
  ): pulumi.CustomResourceOptions {
    return {
      parent: this,
      aliases: [{ parent: pulumi.rootStackResource }],
      ...extra,
    };
  }

  /**
   * Child options for a resource that was v1-PARENTED to another resource and
   * relies on parent-alias INHERITANCE for in-place migration (e.g. SecretVersion
   * under Secret, the NEG under the Cloud Run Service, every project child under
   * the Project).
   *
   * Parents the child to `parent` with NO explicit alias of its own: Pulumi
   * reconstructs the child's old URN from the (root-aliased) parent's alias.
   * Confirmed against real previews in redesign-notes §9/§9c — no explicit child
   * alias needed.
   *
   * @param parent The resource the child was parented to in v1.
   * @param extra  Additional child options merged in.
   */
  protected nestedChildOpts(
    parent: pulumi.Resource,
    extra: pulumi.CustomResourceOptions = {}
  ): pulumi.CustomResourceOptions {
    return {
      parent,
      ...extra,
    };
  }
}
