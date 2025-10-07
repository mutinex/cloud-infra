/**
 * **`@mutinex/cloud-infra/components/repository`** – Google Artifact Registry Repository helper.
 *
 * Provides the `CloudInfraRepository` class which creates a GCP Artifact Registry
 * repository following `CloudInfraMeta` naming conventions. Supports all standard
 * Pulumi `RepositoryArgs` overrides and accepts multi-region identifiers
 * (`us`, `asia`, `europe`, `eu`) or explicit single-region codes.  Location
 * values are automatically normalised so that multi-region alias `eu` is
 * translated to the canonical `europe` accepted by Artifact Registry.
 *
 * @example
 * ```ts
 * const meta = new CloudInfraMeta({ name: "docker", domain: "us", location: "europe" });
 * const repo = new CloudInfraRepository(meta, { format: "DOCKER" });
 * export const repoId = repo.getId();
 * ```
 *
 * @packageDocumentation
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { withDefaults } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';

export type CloudInfraRepositoryConfig = Omit<
  gcp.artifactregistry.RepositoryArgs,
  'location' | 'project' | 'repositoryId' | 'format'
> & {
  project?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  format?: pulumi.Input<string>;
};

export class CloudInfraRepository {
  private readonly meta: CloudInfraMeta;
  private readonly repository: gcp.artifactregistry.Repository;
  private readonly inputName: string;

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraRepositoryConfig = {}
  ) {
    CloudInfraLogger.info('Initializing repository component', {
      component: 'repository',
      operation: 'constructor',
    });

    this.meta = meta;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraRepository expects `meta.name` to be a single string. Use an array-aware component for bulk creation.',
        'repository',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    const repoArgsRaw = cloudInfraConfig as Record<string, unknown>;

    const componentName = meta.getName();

    // Normalize location for Artifact Registry: map 'eu' to canonical 'europe'.
    let normalizedLocation = meta.getLocation();
    if (normalizedLocation === 'eu') {
      CloudInfraLogger.debug('Normalizing EU location to europe', {
        component: 'repository',
        operation: 'normalizeLocation',
      });
      normalizedLocation = 'europe';
    }

    const baseArgs: gcp.artifactregistry.RepositoryArgs = {
      location: normalizedLocation,
      project: meta.getGcpProject(),
      repositoryId: componentName,
      format: 'DOCKER',
      description: componentName,
    };

    const repoArgs = withDefaults<gcp.artifactregistry.RepositoryArgs>(
      baseArgs,
      repoArgsRaw as Partial<gcp.artifactregistry.RepositoryArgs>
    );

    this.repository = new gcp.artifactregistry.Repository(
      componentName,
      repoArgs
    );
  }

  public getRepository(): gcp.artifactregistry.Repository {
    return this.repository;
  }

  public getId(): pulumi.Output<string> {
    return this.repository.id;
  }

  public getName(): pulumi.Output<string> {
    return this.repository.name;
  }

  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:artifactregistry:Repository',
      grouping,
      this.meta,
      this.repository
    );
  }
}
