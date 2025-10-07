import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';

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
export class CloudInfraCloudRunJob {
  private readonly meta: CloudInfraMeta;
  public readonly job: gcp.cloudrunv2.Job;

  constructor(meta: CloudInfraMeta, config: CloudInfraCloudRunJobConfig) {
    CloudInfraLogger.info('Initializing Cloud Run job component', {
      component: 'cloudrunjob',
      operation: 'constructor',
    });

    this.meta = meta;
    const resourceName = meta.getName();

    // Build job args - location defaults to region from meta if not provided
    const jobArgs: gcp.cloudrunv2.JobArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      location: config.location ?? deriveRegion(meta),
    };

    this.job = new gcp.cloudrunv2.Job(resourceName, jobArgs);
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
