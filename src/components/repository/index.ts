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
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

export type CloudInfraRepositoryConfig = Omit<
  gcp.artifactregistry.RepositoryArgs,
  'location' | 'project' | 'repositoryId' | 'format'
> & {
  project?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  format?: pulumi.Input<string>;
};

/**
 * Name-first construction args for `CloudInfraRepository` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the repository config
 * ({@link CloudInfraRepositoryConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining config fields are
 * passed straight through.
 *
 * NB: `location` is `Omit`-ted from the config side because it also exists on
 * {@link NamingArgs} (the two have different types — naming `location` is the
 * meta input, config `location` was a `pulumi.Input<string>`). In the
 * name-first surface `location` is NAMING metadata: it feeds `meta.getLocation()`,
 * which is exactly what the repository uses for the resource location, so the
 * single `location` here drives the deployed location. The legacy config-level
 * `location` override (setting a resource location DIFFERENT from the naming
 * location) is only reachable via the deprecated meta-first overload.
 */
export type CloudInfraRepositoryArgs = NamingArgs &
  Omit<CloudInfraRepositoryConfig, 'location'>;

/** Pulumi type token for the Artifact Registry repository component. */
export const REPOSITORY_TYPE = 'cloud-infra:repository:Repository';

export class CloudInfraRepository extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly repository: gcp.artifactregistry.Repository;
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the repository config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraRepositoryArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraRepository(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraRepositoryConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraRepositoryArgs | CloudInfraRepositoryConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // repository config passed straight through.
    const { meta, config: cloudInfraConfig } =
      splitMetaArgs<CloudInfraRepositoryConfig>(
        nameOrMeta,
        argsOrConfig as
          | (NamingArgs & CloudInfraRepositoryConfig)
          | CloudInfraRepositoryConfig
      );

    const resourceName = meta.getName();

    super(
      REPOSITORY_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

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

    // v1 created the Repository FLAT (stack root); childOpts() aliases it back
    // to root so it migrates in-place. artifactregistry.Repository supports
    // `labels` → merge org labels into its args.
    this.repository = new gcp.artifactregistry.Repository(
      componentName,
      this.withLabels(repoArgs),
      this.childOpts()
    );

    this.registerOutputs({
      repository: this.repository,
    });
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
