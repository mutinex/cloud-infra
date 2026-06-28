import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

/**
 * Configuration for CloudRun job component.
 * Omits project, name, and location (managed by meta).
 */
export type CloudInfraCloudRunJobConfig = Omit<
  gcp.cloudrunv2.JobArgs,
  'project' | 'name' | 'location'
> & {
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
};

/**
 * Name-first construction args for `CloudInfraCloudRunJob` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the job config
 * ({@link CloudInfraCloudRunJobConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining config fields are
 * passed straight through.
 *
 * NB: `location` is `Omit`-ted from the config side because it also exists on
 * {@link NamingArgs} (with a different type). In the name-first surface
 * `location` is NAMING metadata that flows into the meta; the job region then
 * resolves via `deriveRegion(meta)`, so the single `location` here drives the
 * deployed region. The legacy config-level `location` override (a region
 * DIFFERENT from the naming location) is only reachable via the deprecated
 * meta-first overload.
 */
export type CloudInfraCloudRunJobArgs = NamingArgs &
  Omit<CloudInfraCloudRunJobConfig, 'location'>;

/** Pulumi type token for the Cloud Run job component. */
export const CLOUD_RUN_JOB_TYPE = 'cloud-infra:cloudrunjob:CloudRunJob';

/**
 * **Cloud Run Job** component.
 *
 * Wraps a `gcp.cloudrunv2.Job` resource and automatically:
 *   • derives the region from {@link CloudInfraMeta} (if `location` isn't supplied)
 *   • sets the resource name to the CloudInfra-generated identifier
 *   • records outputs via {@link CloudInfraOutput}
 *
 * No additional resources (service-account, scheduler, etc.) are created – the
 * component's sole purpose is to reduce boilerplate and keep naming/region
 * logic consistent across the codebase.
 *
 * @example Minimal job
 * ```ts
 * const meta = new CloudInfraMeta({ name: "daily-backup", domain: "us" });
 * const job  = new CloudInfraCloudRunJob(meta, {
 *   template: {
 *     template: {
 *       containers: [{ image: "gcr.io/my-prj/backup:latest" }],
 *     },
 *   },
 * });
 * ```
 */
export class CloudInfraCloudRunJob extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  public readonly job: gcp.cloudrunv2.Job;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the job config are folded
   * into a single args object; the name is resolved into a `CloudInfraMeta`
   * internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraCloudRunJobArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraCloudRunJob(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraCloudRunJobConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraCloudRunJobArgs | CloudInfraCloudRunJobConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // job config passed straight through.
    const { meta, config } = splitMetaArgs<CloudInfraCloudRunJobConfig>(
      nameOrMeta,
      argsOrConfig as
        | (NamingArgs & CloudInfraCloudRunJobConfig)
        | CloudInfraCloudRunJobConfig
    );

    const resourceName = meta.getName();

    // Register the component node. The Job child parents under `this` and gets
    // the org labels merged into its args via `withLabels()`. The generated
    // NAME is unchanged (F1).
    super(
      CLOUD_RUN_JOB_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing Cloud Run job component', {
      component: 'cloudrunjob',
      operation: 'constructor',
    });

    this.meta = meta;

    // Build job args - location defaults to region from meta if not provided
    const jobArgs: gcp.cloudrunv2.JobArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      location: config.location ?? deriveRegion(meta),
    };

    // v1 created the Job FLAT (stack root); childOpts() aliases it back to its
    // old root-level URN so it updates in place rather than being replaced.
    // gcp.cloudrunv2.Job supports `labels` → merge org labels into its args.
    this.job = new gcp.cloudrunv2.Job(
      resourceName,
      this.withLabels(jobArgs),
      this.childOpts()
    );

    this.registerOutputs({
      job: this.job,
    });
  }

  /** Returns the underlying Pulumi `gcp.cloudrunv2.Job` resource. */
  public getJob(): gcp.cloudrunv2.Job {
    return this.job;
  }

  /** Resolved job name. */
  public getName(): pulumi.Output<string> {
    return this.job.name;
  }

  /** Location (region) where the job is deployed. */
  public getLocation(): pulumi.Output<string> {
    return this.job.location;
  }

  /** Export outputs via `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record('gcp:cloudrunv2:Job', grouping, this.meta, this.job);
  }
}

export const CloudInfraCloudRunJobComponent = CloudInfraCloudRunJob;
