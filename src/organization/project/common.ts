/**
 * CloudInfra Organization – Project *Common Helpers*
 * ------------------------------------------------
 * Type definitions, Zod schemas and small utilities shared by
 * {@link CloudInfraHostProject} and {@link CloudInfraServiceProject}.
 *
 * @packageDocumentation
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';
import { PulumiInputStringSchema } from '../../core/types';
import { gcpConfig } from '../../config';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';

/**
 * Custom delay resource to handle race conditions in GCP resource creation.
 * Useful when dependsOn is not sufficient and resources need time to propagate.
 */
export class DelayResource extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    delayMs: number,
    opts?: pulumi.CustomResourceOptions
  ) {
    const provider: pulumi.dynamic.ResourceProvider = {
      create: async () => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return { id: `delay-${Date.now()}` };
      },
    };

    super(provider, name, {}, opts);
  }
}

/**
 * Baseline Google APIs automatically enabled for every CloudInfra project.
 * These are required for basic project & network operations.
 */

export const baselineApis = [
  'cloudresourcemanager.googleapis.com',
  'compute.googleapis.com',
];

export const apisNeedingIdentities = [
  'servicenetworking.googleapis.com',
  'run.googleapis.com',
  'artifactregistry.googleapis.com',
  'pubsub.googleapis.com',
] as const;

/**
 * Create tag bindings for a project.
 *
 * @param componentName - Name of the component
 * @param project - GCP project resource
 * @param tags - Array of tag value inputs
 * @returns Array of created tag bindings
 */
export function createTagBindings(
  componentName: string,
  project: gcp.organizations.Project,
  config: CloudInfraProjectCustomConfig
): gcp.tags.TagBinding[] {
  const bindings: gcp.tags.TagBinding[] = [];

  if (!config.cloudInfraTags?.length) {
    return [];
  }

  config.cloudInfraTags.forEach((tag: pulumi.Input<string>) => {
    pulumi.output(tag).apply((tagId: string) => {
      const tagKey = tagId.split('/').pop() || 'tag';
      const resourceName = `${componentName}:ProjectTagBinding:${tagKey}`;

      const tagBinding = new gcp.tags.TagBinding(
        resourceName,
        {
          parent: pulumi.interpolate`//cloudresourcemanager.googleapis.com/projects/${project.number}`,
          tagValue: tagId,
        },
        { deleteBeforeReplace: true, parent: project }
      );
      bindings.push(tagBinding);
    });
  });

  return bindings;
}

/**
 * Base schema for CloudInfra project extras.
 */
export const CloudInfraProjectCustomConfigSchema = z
  .object({
    cloudInfraTags: z.array(PulumiInputStringSchema).optional(),
    services: z.array(z.string()).optional().default([]),
    billingAccount: z.string().optional().default(gcpConfig.billingAccountId),
    vpcHostProject: PulumiInputStringSchema.optional(),
  })
  .passthrough();

export type CloudInfraProjectCustomConfig = {
  cloudInfraTags?: (string | pulumi.Output<string>)[];
  services?: string[];
  billingAccount?: string;
  vpcHostProject?: string | pulumi.Output<string>;
};

export type CloudInfraProjectConfig = gcp.organizations.ProjectArgs &
  CloudInfraProjectCustomConfig;

/**
 * Configuration for creating service identities.
 */
export interface ServiceIdentityConfig {
  /** Component name for resource naming */
  componentName: string;
  /** The GCP project resource */
  project: gcp.organizations.Project;
  /** The project ID */
  projectId: pulumi.Output<string>;
  /** List of all enabled APIs in the project */
  enabledApis: string[];
  /** List of APIs that need service identities */
  apisNeedingIdentities: readonly string[];
  /** Optional dependencies for the service identities */
  dependencies?: pulumi.Resource[];
}

/**
 * Result of creating service identities.
 */
export interface ServiceIdentityResult {
  /** Map of API name to ServiceIdentity resource */
  identities: Record<string, gcp.projects.ServiceIdentity>;
  /** Helper function to export identities to CloudInfraOutput */
  exportToOutput: (
    manager: CloudInfraOutput,
    groupingPrefix: string,
    meta: CloudInfraMeta
  ) => void;
}

/**
 * Extract the service name from a Google API URL.
 * For example: "servicenetworking.googleapis.com" -> "servicenetworking"
 */
function extractApiShortName(apiUrl: string): string {
  return apiUrl.replace(/\.googleapis\.com$/, '');
}

/**
 * Create service identities for specified APIs.
 *
 * This helper function creates GCP service identities for APIs that are both
 * enabled in the project and specified in the apisNeedingIdentities list.
 * It returns the created identities and provides a helper function for
 * exporting them to CloudInfraOutput.
 *
 * @param config Configuration for creating service identities
 * @returns Object containing the created identities and an export helper
 *
 * @example
 * ```ts
 * const { identities, exportToOutput } = createServiceIdentities({
 *   componentName: "my-project",
 *   project: myProject,
 *   projectId: myProject.projectId,
 *   enabledApis: ["compute.googleapis.com", "servicenetworking.googleapis.com"],
 *   apisNeedingIdentities: ["servicenetworking.googleapis.com"],
 *   dependencies: [sharedVpcBinding]
 * });
 *
 * // Later, export to output manager
 * exportToOutput(outputManager, "my-project", meta);
 * ```
 */
export function createServiceIdentities(
  config: ServiceIdentityConfig
): ServiceIdentityResult {
  const {
    componentName,
    project,
    projectId,
    enabledApis,
    apisNeedingIdentities,
    dependencies = [],
  } = config;

  // Filter APIs that are both enabled and need identities
  const apisToProcess = apisNeedingIdentities.filter(api =>
    enabledApis.includes(api)
  );

  // Create service identity for each API
  const identities = Object.fromEntries(
    apisToProcess.map(api => {
      const apiShortName = extractApiShortName(api);
      const resourceName = `${componentName}:${apiShortName}-identity`;

      const identity = new gcp.projects.ServiceIdentity(
        resourceName,
        {
          project: projectId,
          service: api,
        },
        {
          parent: project,
          dependsOn: dependencies,
        }
      );

      return [api, identity];
    })
  );

  // Export helper function
  const exportToOutput = (
    manager: CloudInfraOutput,
    groupingPrefix: string,
    meta: CloudInfraMeta
  ) => {
    Object.entries(identities).forEach(([api, identity]) => {
      const apiShortName = extractApiShortName(api);
      manager.record(
        'gcp:serviceaccount:Account',
        `${groupingPrefix}-${apiShortName}`,
        meta,
        identity
      );
    });
  };

  return {
    identities,
    exportToOutput,
  };
}
