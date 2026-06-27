/**
 * Part of **`@mutinex/cloud-infra`** – v2 ComponentResource pathway (PROTOTYPE).
 *
 * `CloudInfraComponent` is a thin shared base on top of
 * {@link pulumi.ComponentResource}. Its job is to give every v2 component:
 *
 *   1. A real Pulumi component node in the resource graph (so children can be
 *      parented under it and surfaced as a logical unit).
 *   2. A `childOpts()` helper that both (a) parents children to the component
 *      and (b) attaches a resource `transformation` which stamps uniform org
 *      labels onto *every* child – regardless of whether that child's args
 *      spread caller config or not. This closes the class of bugs where a label
 *      block is wired into one child but silently forgotten on a sibling.
 *
 * This is runtime-light: the base creates no GCP resources itself.
 */

import * as pulumi from '@pulumi/pulumi';

/**
 * The baseline org labels stamped onto every child of a `CloudInfraComponent`.
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

/**
 * Shared base class for v2 cloud-infra ComponentResources.
 *
 * @typeParam typeToken The fully-qualified Pulumi type token, e.g.
 *   `"cloud-infra:cloudrunservice:CloudRunService"`.
 */
export abstract class CloudInfraComponent extends pulumi.ComponentResource {
  /**
   * Pulumi type tokens for child resources whose GCP schema has NO `labels`
   * input. The label-stamping transformation skips these so it never injects an
   * unsupported `labels` key (which the provider rejects with "Invalid or
   * unknown key", failing the deployment). Serverless NEGs are the case that
   * surfaced this; extend as new label-less children appear.
   */
  private static readonly LABEL_UNSUPPORTED_TYPES: ReadonlySet<string> =
    new Set([
      'gcp:compute/regionNetworkEndpointGroup:RegionNetworkEndpointGroup',
      // SecretVersion / RegionalSecretVersion are transitive children of the
      // Secret/RegionalSecret (parent: this.secret). The label transformation
      // attached to the Secret via childOpts propagates to them, but the
      // *Version resources have NO `labels` input and reject it with
      // "Invalid or unknown key". Skip them.
      'gcp:secretmanager/secretVersion:SecretVersion',
      'gcp:secretmanager/regionalSecretVersion:RegionalSecretVersion',
    ]);

  /** The resolved, generated resource name shared by the component's children. */
  protected readonly generatedName: string;

  /** Baseline labels stamped onto every child via {@link childOpts}. */
  private readonly baselineLabels: CloudInfraComponentLabels;

  /**
   * @param typeToken      Fully-qualified Pulumi component type token.
   * @param name           The caller-supplied (input) name. Also used as the
   *                       `service` label value.
   * @param generatedName  The fully-resolved generated resource name (computed
   *                       by the concrete component, typically via
   *                       `CloudInfraMeta`). Exposed via {@link getName}.
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
    this.baselineLabels = {
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
   * Build `CustomResourceOptions` for a child resource.
   *
   * The returned options:
   *   - set `parent: this` so the child lives under the component, and
   *   - attach a `transformation` that merges the baseline org labels into the
   *     child's `props.labels`.
   *
   * Label merge semantics: `{ ...baseline, ...existing }`. The baseline
   * provides a uniform floor; any label the caller already set on the child
   * wins (so callers can override, e.g., a per-resource `service` value).
   *
   * The transformation is the load-bearing part: it runs against *every* child
   * regardless of whether that child's args spread caller config, so labels can
   * never be "forgotten" on one sibling while present on another.
   *
   * @param extra Additional child options to merge in (e.g. `aliases`).
   *   Any caller-supplied `transformations` run after the label transformation.
   */
  protected childOpts(
    extra: pulumi.CustomResourceOptions = {}
  ): pulumi.CustomResourceOptions {
    const labelTransformation: pulumi.ResourceTransformation = args => {
      // Not every GCP resource accepts a `labels` input. Serverless
      // RegionNetworkEndpointGroups, for instance, reject it ("Invalid or
      // unknown key"). Stamping labels onto such a child would fail the whole
      // deployment. Skip those types so the floor is applied only where the
      // provider supports it.
      if (CloudInfraComponent.LABEL_UNSUPPORTED_TYPES.has(args.type)) {
        return { props: args.props, opts: args.opts };
      }

      const existing =
        (args.props as { labels?: Record<string, pulumi.Input<string>> })
          .labels ?? {};

      return {
        props: {
          ...args.props,
          labels: { ...this.baselineLabels, ...existing },
        },
        opts: args.opts,
      };
    };

    const { transformations: extraTransformations, ...restExtra } = extra;

    return {
      parent: this,
      ...restExtra,
      transformations: [labelTransformation, ...(extraTransformations ?? [])],
    };
  }
}
