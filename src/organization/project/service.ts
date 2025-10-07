import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';
import {
  createTagBindings,
  baselineApis,
  CloudInfraProjectCustomConfigSchema,
  CloudInfraProjectConfig,
  DelayResource,
  createServiceIdentities,
  ServiceIdentityResult,
  apisNeedingIdentities,
} from './common';
import { ServiceUsageApiBootstrap } from './bootstrap';

/**
 * CloudInfra Organization – Service Project
 * --------------------------------------
 * Helper that provisions a **GCP *service* project** and attaches it to a
 * Shared VPC hosted in another CloudInfra project.  It handles:
 *
 * • Creating the `gcp.organizations.Project` resource with correct naming and
 *   optional folder / org placement.
 * • Enabling a baseline set of Google APIs plus any additional APIs requested
 *   by the caller *before* the project is attached to the host network.
 * • Binding the project to the host using `gcp.compute.SharedVPCServiceProject`.
 * • Granting `roles/vpcaccess.user` on the host project to the service account
 *   used by the Serverless VPC Access connector when the `vpcaccess` API is
 *   enabled.
 * • Writing everything to {@link CloudInfraOutput} for cross-stack references.
 *
 * @see {@link CloudInfraHostProject} for the complementary host-side component.
 * @packageDocumentation
 */

/**
 * CloudInfra Service Project that connects to a shared VPC host project.
 */
export class CloudInfraServiceProject {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraProjectConfig;
  private readonly project: gcp.organizations.Project;
  private readonly tagBindings: gcp.tags.TagBinding[] = [];
  private readonly enabledServices: gcp.projects.Service[] = [];
  private readonly enabledApiNames: string[] = [];
  private sharedVpcServiceBinding?: gcp.compute.SharedVPCServiceProject;
  private serviceIdentityResult?: ServiceIdentityResult;
  /** Cached single input name (throws if meta.name is an array). */
  private readonly inputName: string;
  private readonly componentName: string;

  /**
   * Create a new CloudInfra Service Project.
   *
   * @param meta - Metadata for naming and configuration
   * @param config - Service project configuration including VPC host project
   */
  constructor(meta: CloudInfraMeta, config: CloudInfraProjectConfig) {
    CloudInfraLogger.info(
      'Initializing GCP Service Project with Shared VPC attachment',
      {
        component: 'project-service',
        operation: 'constructor',
      }
    );

    this.meta = meta;
    this.config = CloudInfraProjectCustomConfigSchema.parse(config);

    // Validate that the caller supplied a single `name` string rather than an
    // array (arrays are unsupported for project-level components).
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraServiceProject expects `meta.name` to be a single string. ' +
          'Create individual service projects for each name instead.',
        'project-service',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    this.componentName = meta.getName();

    const projectArgs: gcp.organizations.ProjectArgs = {
      ...this.config,
    };

    if (this.config.folderId) {
      projectArgs.folderId = this.config.folderId;
    } else if (this.config.orgId) {
      projectArgs.orgId = this.config.orgId;
    }

    this.project = new gcp.organizations.Project(
      this.componentName,
      projectArgs,
      {
        protect: this.config.deletionPolicy === 'PREVENT',
      }
    );

    // Bootstrap and enable API services
    const { enabledServicesRes, enabledServices, enabledApiNames } =
      this.bootstrapAndEnableServices();

    // Record tag bindings
    this.tagBindings.push(
      ...createTagBindings(this.componentName, this.project, this.config)
    );

    // Explicitly push every created service into class state
    this.enabledServices.push(...enabledServices);
    this.enabledApiNames.push(...enabledApiNames);

    // Always create service identities for APIs that need them
    this.createServiceIdentities(enabledServicesRes);

    // Only create VPC-related resources if vpcHostProject is provided
    if (this.config.vpcHostProject) {
      this.setupVpcAttachments(enabledServicesRes);
    }
  }

  /**
   * Bootstrap Service Usage API and enable configured services.
   */
  private bootstrapAndEnableServices(): {
    enabledServicesRes?: gcp.projects.Service;
    enabledServices: gcp.projects.Service[];
    enabledApiNames: string[];
  } {
    CloudInfraLogger.info(
      'Bootstrapping Service Usage API and enabling services',
      {
        component: 'project-service',
        operation: 'bootstrapAndEnableServices',
      }
    );
    const serviceUsageApiBootstrap = new ServiceUsageApiBootstrap(
      `${this.componentName}-bootstrap`,
      { projectId: this.project.projectId },
      { parent: this.project }
    );
    const gcpService = new gcp.projects.Service(
      `${this.componentName}:serviceusage-googleapis-com`,
      {
        project: this.project.projectId,
        service: 'serviceusage.googleapis.com',
        disableOnDestroy: false,
      },
      { parent: this.project, dependsOn: [serviceUsageApiBootstrap] }
    );
    return this.enableApiServices(
      this.componentName,
      this.config.services,
      gcpService
    );
  }

  /**
   * Create service identities for APIs that need them.
   */
  private createServiceIdentities(
    enabledServicesRes?: gcp.projects.Service
  ): void {
    if (apisNeedingIdentities.length > 0) {
      this.serviceIdentityResult = createServiceIdentities({
        componentName: this.componentName,
        project: this.project,
        projectId: this.project.projectId,
        enabledApis: this.enabledApiNames,
        apisNeedingIdentities,
        dependencies: enabledServicesRes ? [enabledServicesRes] : [],
      });
    }
  }

  /**
   * Handle Shared VPC attachment and IAM grants for this service project.
   */
  private setupVpcAttachments(enabledServicesRes?: gcp.projects.Service): void {
    CloudInfraLogger.info('Setting up Shared VPC attachments and IAM grants', {
      component: 'project-service',
      operation: 'setupVpcAttachments',
    });
    this.sharedVpcServiceBinding = new gcp.compute.SharedVPCServiceProject(
      `${this.componentName}:sharedVpcService`,
      {
        hostProject: this.config.vpcHostProject!,
        serviceProject: this.project.projectId,
      },
      {
        parent: this.project,
        dependsOn: enabledServicesRes ? [enabledServicesRes] : [],
      }
    );

    // Handle IAM for service networking identity if it was created
    const serviceNetworkingIdentity =
      this.serviceIdentityResult?.identities[
        'servicenetworking.googleapis.com'
      ];
    if (serviceNetworkingIdentity) {
      const serviceIdentityDelay = new DelayResource(
        `${this.componentName}:service-identity-delay`,
        3000,
        {
          parent: this.project,
          dependsOn: [serviceNetworkingIdentity],
        }
      );

      new gcp.projects.IAMMember(
        `${this.componentName}:network-user`,
        {
          project: this.config.vpcHostProject!,
          role: 'roles/compute.networkUser',
          member: pulumi.interpolate`serviceAccount:${serviceNetworkingIdentity.email}`,
        },
        {
          parent: this.project,
          dependsOn: [serviceIdentityDelay],
        }
      );

      // Handle IAM for Cloud Run identity if it was created
      const cloudRunIdentity =
        this.serviceIdentityResult?.identities['run.googleapis.com'];
      if (cloudRunIdentity && this.config.vpcHostProject) {
        new gcp.projects.IAMMember(
          `${this.componentName}:vpcaccess`,
          {
            project: this.config.vpcHostProject!,
            role: 'roles/vpcaccess.user',
            member: pulumi.interpolate`serviceAccount:${cloudRunIdentity.email}`,
          },
          {
            parent: this.project,
            dependsOn: [serviceIdentityDelay],
          }
        );
      }

      new gcp.projects.IAMMember(
        `${this.componentName}:service-networking-agent`,
        {
          project: this.project.projectId,
          role: 'roles/servicenetworking.serviceAgent',
          member: pulumi.interpolate`serviceAccount:${serviceNetworkingIdentity.email}`,
        },
        { parent: this.project, dependsOn: [serviceIdentityDelay] }
      );
    }
  }

  /**
   * Get the underlying GCP project resource.
   *
   * @returns GCP project resource
   */
  public getProject(): gcp.organizations.Project {
    return this.project;
  }

  /**
   * Get the project ID.
   *
   * @returns Pulumi Output containing the project ID
   */
  public getProjectId(): pulumi.Output<string> {
    return this.project.projectId;
  }

  /**
   * Get the project number.
   *
   * @returns Pulumi Output containing the project number
   */
  public getProjectNumber(): pulumi.Output<string> {
    return this.project.number;
  }

  /**
   * Get all tag bindings for this project.
   *
   * @returns Array of tag binding resources
   */
  public getTagBindings(): gcp.tags.TagBinding[] {
    return this.tagBindings;
  }

  /**
   * Get all enabled services for this project.
   *
   * @returns Array of enabled service resources
   */
  public getEnabledServices(): gcp.projects.Service[] {
    return this.enabledServices;
  }

  /**
   * Export outputs to the CloudInfraOutput manager.
   *
   * @param manager - Output manager instance
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:organizations:Project',
      grouping,
      this.meta,
      this.project
    );

    if (this.serviceIdentityResult) {
      this.serviceIdentityResult.exportToOutput(manager, grouping, this.meta);
    }
  }

  /**
   * Enable API services for the project.
   *
   * @param componentName - Component name for resource naming
   * @param services - Array of service names to enable
   * @param gcpService - Service Usage API service resource
   * @returns Object containing compute service resource and dependencies
   */

  private enableApiServices(
    componentName: string,
    services: string[] | undefined,
    gcpService: gcp.projects.Service
  ): {
    enabledServicesRes?: gcp.projects.Service;
    enabledServices: gcp.projects.Service[];
    enabledApiNames: string[];
  } {
    const enabledServices: gcp.projects.Service[] = [gcpService];
    const enabledApiNames: string[] = ['serviceusage.googleapis.com'];

    // merge baseline + user APIs - baseline first, then user APIs (filtered for duplicates)
    const userProvidedApis = services ?? [];
    const baselineApiSet = new Set(baselineApis);
    const userProvidedApiSet = userProvidedApis.filter(
      api => !baselineApiSet.has(api)
    );
    const orderedApis = [...baselineApis, ...userProvidedApiSet];

    let enabledServicesRes: gcp.projects.Service | undefined;

    // Enable each API service sequentially to maintain proper dependency chain
    const newServices: { service: gcp.projects.Service; apiName: string }[] =
      [];

    for (const svc of orderedApis) {
      const safe = svc.replace(/[^a-z0-9]/gi, '-').slice(0, 40);
      const resName = `${componentName}:${safe}`.slice(0, 60);
      const svcRes = new gcp.projects.Service(
        resName,
        {
          project: this.project.projectId,
          service: svc,
          disableOnDestroy: true,
        },
        { parent: this.project, dependsOn: enabledServices }
      );

      if (svc === 'compute.googleapis.com') enabledServicesRes = svcRes;

      // Add the new service to the dependency chain immediately
      enabledServices.push(svcRes);
      enabledApiNames.push(svc);
      newServices.push({ service: svcRes, apiName: svc });
    }

    return { enabledServicesRes, enabledServices, enabledApiNames };
  }
}
