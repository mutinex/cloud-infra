import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ServiceUsageApiBootstrap } from './bootstrap';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';
import {
  baselineApis,
  CloudInfraProjectCustomConfigSchema,
  CloudInfraProjectConfig,
  createTagBindings,
  createServiceIdentities,
  ServiceIdentityResult,
  apisNeedingIdentities,
  DelayResource,
} from './common';
import { gcpConfig } from '../../config';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the Host Project component. */
export const CLOUD_INFRA_HOST_PROJECT_TYPE =
  'cloud-infra:project:CloudInfraHostProject';

/**
 * Name-first construction args for `CloudInfraHostProject` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the project config
 * ({@link CloudInfraProjectConfig}) into a single args object, so a host project
 * can be built as
 * `new CloudInfraHostProject("net", { domain: "au", services: [...] })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the project config — every deep child name (incl. the
 * `:`-delimited API/service names, the Shared-VPC network/host-binding, the two
 * dynamic providers, and `protect`/`dependsOn` wiring) is derived exactly as the
 * meta-first path.
 *
 * `gcp.organizations.Project` has no `location`, so {@link NamingArgs.location}
 * (which drives only the generated name) cannot collide with the config arm.
 */
export type CloudInfraHostProjectArgs = NamingArgs & CloudInfraProjectConfig;

/**
 * CloudInfra Organization – Host Project
 * -----------------------------------
 * Opinionated wrapper that creates a **GCP *host* project** with a
 * single-name Shared VPC network and enables a curated set of Google APIs.
 *
 * Key responsibilities:
 * • Creates `gcp.organizations.Project` inside an organisation or folder.
 * • Enables the Service Usage API *immediately* so other API enablements work.
 * • Enables baseline + user-supplied APIs using `gcp.projects.Service`.
 * • Creates a *single* Shared VPC network whose name matches the project.
 * • Promotes the project to host-mode via `gcp.compute.SharedVPCHostProject`.
 * • Records the project and network in {@link CloudInfraOutput}.
 *
 * @see {@link CloudInfraServiceProject} for attaching service projects.
 * @packageDocumentation
 */

/**
 * CloudInfra Host Project with automatic shared VPC configuration.
 * The shared VPC network automatically uses the same name as the project (from meta).
 */
export class CloudInfraHostProject extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly project: gcp.organizations.Project;
  private readonly tagBindings: gcp.tags.TagBinding[] = [];
  private readonly enabledServices: gcp.projects.Service[] = [];
  private readonly enabledApiNames: string[] = [];
  private sharedVpcNetwork?: gcp.compute.Network;
  private sharedVpcHostBinding?: gcp.compute.SharedVPCHostProject;
  private serviceIdentityResult?: ServiceIdentityResult;
  /** Cached single input name (throws if meta was constructed with an array). */
  private readonly inputName: string;
  private readonly componentName: string;
  private readonly config: CloudInfraProjectConfig;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the project config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   * Every deep child (project, bootstrap + delay dynamic providers, the
   * `:`-delimited API services, Shared-VPC network/host-binding, IAM members)
   * keeps its name, parent, alias, labels and `protect`/`dependsOn` wiring
   * exactly as the meta-first path — only meta acquisition is rerouted.
   */
  constructor(
    name: string,
    args: CloudInfraHostProjectArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraHostProject(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   *
   * @param meta - Metadata for naming and configuration
   * @param config - Optional project configuration
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraProjectConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraHostProjectArgs | CloudInfraProjectConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // project config passed straight through (consumed UNCHANGED below — every
    // child name, dynamic provider, protect/dependsOn is derived from it).
    let meta: CloudInfraMeta;
    let config: CloudInfraProjectConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraHostProjectArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = nameOrMeta;
      config = argsOrConfig as CloudInfraProjectConfig;
    }

    // ── Pre-super computation ──────────────────────────────────────────────
    // `super()` must be the first statement, so the name/validation logic that
    // previously ran at the top of the body is hoisted here WITHOUT changing
    // the computed values. These calls read from `meta` only (not `this`).
    const parsedConfig = CloudInfraProjectCustomConfigSchema.parse(config);

    // Validate that the caller supplied a single `name` string rather than an
    // array (arrays are unsupported for project-level components).
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraHostProject expects `meta.name` to be a single string. ' +
          'Create separate host projects for each name instead.',
        'project-host',
        'constructor'
      );
    }

    const componentName = meta.getName();

    // Register the component node. Children parent under `this`; the Project
    // (the only label-supporting child) gets the org labels merged into its
    // args via `withLabels()`. The generated NAME is unchanged (F1/F2).
    super(
      CLOUD_INFRA_HOST_PROJECT_TYPE,
      componentName,
      componentName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing GCP Host Project with Shared VPC', {
      component: 'project-host',
      operation: 'constructor',
    });

    this.meta = meta;
    this.config = parsedConfig;
    this.inputName = candidateInputName;
    this.componentName = componentName;

    const projectArgs: gcp.organizations.ProjectArgs = {
      ...this.config,
    };

    if (this.config.folderId) {
      projectArgs.folderId = this.config.folderId;
    } else {
      projectArgs.orgId = gcpConfig.organizationId;
    }

    // Project moves UNDER this component. v1 created it FLAT (no parent), so
    // childOpts() aliases it back to its old root-level URN to migrate IN-PLACE.
    // It is the ONLY child here that supports `labels` → merge the org floor
    // into its args via withLabels. `protect` is preserved exactly. Its deep
    // children parent under it (nestedChildOpts) and migrate via parent-alias
    // inheritance (§9c).
    this.project = new gcp.organizations.Project(
      this.componentName,
      this.withLabels(projectArgs),
      this.childOpts({
        protect: this.config.deletionPolicy === 'PREVENT',
      })
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

    // Setup Shared VPC network and host binding
    this.setupSharedVpc(enabledServicesRes);

    this.registerOutputs({
      project: this.project,
      sharedVpcNetwork: this.sharedVpcNetwork,
    });
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
        component: 'project-host',
        operation: 'bootstrapAndEnableServices',
      }
    );
    const serviceUsageApiBootstrap = new ServiceUsageApiBootstrap(
      `${this.componentName}-bootstrap`,
      { projectId: this.project.projectId },
      this.nestedChildOpts(this.project)
    );
    const gcpService = new gcp.projects.Service(
      `${this.componentName}:serviceusage-googleapis-com`,
      {
        project: this.project.projectId,
        service: 'serviceusage.googleapis.com',
        disableOnDestroy: false,
      },
      this.nestedChildOpts(this.project, {
        dependsOn: [serviceUsageApiBootstrap],
      })
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
   * Create Shared VPC network and host project binding.
   */
  private setupSharedVpc(enabledServicesRes?: gcp.projects.Service): void {
    CloudInfraLogger.info('Setting up Shared VPC network and host binding', {
      component: 'project-host',
      operation: 'setupSharedVpc',
    });
    this.sharedVpcNetwork = new gcp.compute.Network(
      this.componentName,
      {
        project: this.project.projectId,
        name: this.componentName,
        autoCreateSubnetworks: false,
        deleteDefaultRoutesOnCreate: true,
      },
      this.nestedChildOpts(this.project, {
        dependsOn: enabledServicesRes ? [enabledServicesRes] : [],
      })
    );
    this.sharedVpcHostBinding = new gcp.compute.SharedVPCHostProject(
      this.componentName,
      {
        project: this.project.projectId,
      },
      this.nestedChildOpts(this.project, { dependsOn: [this.sharedVpcNetwork] })
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
        this.nestedChildOpts(this.project, {
          dependsOn: [serviceNetworkingIdentity],
        })
      );

      new gcp.projects.IAMMember(
        `${this.componentName}:service-networking-agent`,
        {
          project: this.project.projectId,
          role: 'roles/servicenetworking.serviceAgent',
          member: pulumi.interpolate`serviceAccount:${serviceNetworkingIdentity.email}`,
        },
        this.nestedChildOpts(this.project, {
          dependsOn: [serviceIdentityDelay],
        })
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

    if (this.sharedVpcNetwork) {
      manager.record(
        'gcp:compute:Network',
        grouping,
        this.meta,
        this.sharedVpcNetwork
      );
    }

    if (this.serviceIdentityResult) {
      this.serviceIdentityResult.exportToOutput(manager, grouping, this.meta);
    }
  }

  /**
   * Enable API services for the project.
   *
   * @param componentName - Component name for resource naming
   * @param services - Array of service names to enable
   * @param enabledService - Service Usage API service resource
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
        this.nestedChildOpts(this.project, { dependsOn: enabledServices })
      );

      if (svc === 'compute.googleapis.com') enabledServicesRes = svcRes;

      // Add the new service to the dependency chain immediately
      enabledServices.push(svcRes);
      enabledApiNames.push(svc);
      newServices.push({ service: svcRes, apiName: svc });
    }

    return { enabledServicesRes, enabledServices, enabledApiNames };
  }

  /**
   * Get the shared VPC network resource.
   *
   * @returns Shared VPC network resource (always available for host projects)
   */
  public getSharedVpcNetwork(): gcp.compute.Network {
    return this.sharedVpcNetwork!; // Always available since we always create it
  }

  /**
   * Get the shared VPC network self link.
   *
   * @returns Pulumi Output containing the network self link
   */
  public getSharedVpcSelfLink(): pulumi.Output<string> {
    return this.sharedVpcNetwork!.selfLink;
  }

  /**
   * Get the shared VPC network name.
   *
   * @returns Pulumi Output containing the network name
   */
  public getSharedVpcName(): pulumi.Output<string> {
    return this.sharedVpcNetwork!.name;
  }

  /**
   * Get the shared VPC network ID.
   *
   * @returns Pulumi Output containing the network ID
   */
  public getSharedVpcId(): pulumi.Output<string> {
    return this.sharedVpcNetwork!.id;
  }
}
