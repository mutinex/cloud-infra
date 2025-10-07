import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import {
  ProjectResourceHandler,
  FolderResourceHandler,
  ServiceAccountResourceHandler,
  BucketResourceHandler,
  SubnetworkResourceHandler,
  CloudRunServiceResourceHandler,
  CloudRunJobResourceHandler,
  SecretResourceHandler,
  RepositoryResourceHandler,
  ComputeInstanceResourceHandler,
} from './resource-types';
import {
  ProjectResourceInfo,
  FolderResourceInfo,
  ServiceAccountResourceInfo,
  BucketResourceInfo,
  SubnetworkResourceInfo,
  CloudRunServiceResourceInfo,
  CloudRunJobResourceInfo,
  SecretResourceInfo,
  RepositoryResourceInfo,
  ComputeInstanceResourceInfo,
  IamBindingParams,
} from '../types/common-types';
import { IamBuilderRegistry } from '../builders/iam-builder-registry';
import { hasProperty, hasMethod } from '../../helpers';

/**
 * Project resource handler
 */
export class ProjectResourceHandlerImpl implements ProjectResourceHandler {
  readonly supportedType = 'gcp:organizations/project:Project' as const;

  extractResourceInfo(resource: unknown): ProjectResourceInfo {
    const projectId = this.getProjectId(resource);
    if (!projectId) {
      throw new Error('Unable to determine projectId for resource');
    }

    return {
      id: projectId,
      name: projectId,
      projectId,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getProjectId(resource: unknown): pulumi.Input<string> | undefined {
    if (hasMethod(resource, 'getProjectId')) {
      return resource.getProjectId() as pulumi.Input<string>;
    }
    if (hasProperty(resource, 'projectId')) {
      return resource.projectId as pulumi.Input<string>;
    }
    if (hasProperty(resource, 'id')) {
      return resource.id as pulumi.Input<string>;
    }
    return undefined;
  }
}

/**
 * Folder resource handler
 */
export class FolderResourceHandlerImpl implements FolderResourceHandler {
  readonly supportedType = 'gcp:organizations/folder:Folder' as const;

  extractResourceInfo(resource: unknown): FolderResourceInfo {
    const folderId = this.getFolderId(resource);
    if (!folderId) {
      throw new Error('Unable to determine folder id');
    }

    return {
      id: folderId,
      name: folderId,
      folderId,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getFolderId(resource: unknown): pulumi.Input<string> | undefined {
    if (hasMethod(resource, 'getFolder')) {
      const folder = resource.getFolder() as unknown;
      if (folder instanceof gcp.organizations.Folder) {
        return folder.id;
      }
    }
    if (resource instanceof gcp.organizations.Folder) {
      return resource.id;
    }
    if (hasProperty(resource, 'id')) {
      return resource.id as pulumi.Input<string>;
    }
    return undefined;
  }
}

/**
 * Service Account resource handler
 */
export class ServiceAccountResourceHandlerImpl
  implements ServiceAccountResourceHandler
{
  readonly supportedType = 'gcp:serviceaccount/account:Account' as const;

  extractResourceInfo(resource: unknown): ServiceAccountResourceInfo {
    const serviceAccountId = this.getServiceAccountId(resource);
    if (!serviceAccountId) {
      throw new Error('Unable to determine service account ID');
    }

    return {
      id: serviceAccountId,
      name: serviceAccountId,
      serviceAccountId,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getServiceAccountId(
    resource: unknown
  ): pulumi.Input<string> | undefined {
    if (hasMethod(resource, 'getServiceAccount')) {
      const sa = resource.getServiceAccount() as unknown;
      if (sa instanceof gcp.serviceaccount.Account) {
        return sa.name;
      }
    }
    if (resource instanceof gcp.serviceaccount.Account) {
      return resource.name;
    }
    if (hasProperty(resource, 'name')) {
      return resource.name as pulumi.Input<string>;
    }
    return undefined;
  }
}

/**
 * Bucket resource handler
 */
export class BucketResourceHandlerImpl implements BucketResourceHandler {
  readonly supportedType = 'gcp:storage/bucket:Bucket' as const;

  extractResourceInfo(resource: unknown): BucketResourceInfo {
    const bucketName = this.getBucketName(resource);
    if (!bucketName) {
      throw new Error('Unable to determine bucket name');
    }

    return {
      id: bucketName,
      name: bucketName,
      bucketName,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getBucketName(resource: unknown): pulumi.Input<string> | undefined {
    if (hasMethod(resource, 'getBucket')) {
      const bucket = resource.getBucket() as unknown;
      if (bucket instanceof gcp.storage.Bucket) {
        return bucket.name;
      }
    }
    if (resource instanceof gcp.storage.Bucket) {
      return resource.name;
    }
    if (hasProperty(resource, 'name')) {
      return resource.name as pulumi.Input<string>;
    }
    return undefined;
  }
}

/**
 * Subnetwork resource handler
 */
export class SubnetworkResourceHandlerImpl
  implements SubnetworkResourceHandler
{
  readonly supportedType = 'gcp:compute/subnetwork:Subnetwork' as const;

  extractResourceInfo(resource: unknown): SubnetworkResourceInfo {
    const subnetData = this.getSubnetworkData(resource);
    if (!subnetData.subnetworkName || !subnetData.region) {
      throw new Error('Unable to determine subnetwork name/region');
    }

    return {
      id: subnetData.subnetworkName,
      name: subnetData.subnetworkName,
      subnetworkName: subnetData.subnetworkName,
      region: subnetData.region,
      project: subnetData.project,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getSubnetworkData(resource: unknown): {
    subnetworkName?: pulumi.Input<string>;
    region?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    let subnet: unknown = resource;
    if (hasMethod(resource, 'getSubnetwork')) {
      subnet = resource.getSubnetwork();
    }

    if (subnet instanceof gcp.compute.Subnetwork) {
      return {
        subnetworkName: subnet.name,
        region: subnet.region,
        project:
          ((subnet as unknown as Record<string, unknown>)
            .project as pulumi.Input<string>) ??
          ((subnet as unknown as Record<string, unknown>)
            .project_ as pulumi.Input<string>),
      };
    }

    return {
      subnetworkName: hasProperty(subnet, 'name')
        ? (subnet.name as pulumi.Input<string>)
        : undefined,
      region: hasProperty(subnet, 'region')
        ? (subnet.region as pulumi.Input<string>)
        : undefined,
      project: hasProperty(subnet, 'project')
        ? (subnet.project as pulumi.Input<string>)
        : undefined,
    };
  }
}

/**
 * Cloud Run Service resource handler
 */
export class CloudRunServiceResourceHandlerImpl
  implements CloudRunServiceResourceHandler
{
  readonly supportedType = 'gcp:cloudrunv2/service:Service' as const;

  extractResourceInfo(resource: unknown): CloudRunServiceResourceInfo {
    const serviceData = this.getServiceData(resource);
    if (!serviceData.serviceName || !serviceData.location) {
      throw new Error('Unable to determine Cloud Run Service name/location');
    }

    return {
      id: serviceData.serviceName,
      name: serviceData.serviceName,
      serviceName: serviceData.serviceName,
      location: serviceData.location,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getServiceData(resource: unknown): {
    serviceName?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
  } {
    let svc: unknown = resource;
    if (hasMethod(resource, 'getService')) {
      svc = resource.getService();
    }

    if (svc instanceof gcp.cloudrunv2.Service) {
      return {
        serviceName: svc.name,
        location:
          ((svc as unknown as Record<string, unknown>)
            .location as pulumi.Input<string>) ??
          ((svc as unknown as Record<string, unknown>)
            .location_ as pulumi.Input<string>),
      };
    }

    return {
      serviceName: hasProperty(svc, 'name')
        ? (svc.name as pulumi.Input<string>)
        : undefined,
      location: hasProperty(svc, 'location')
        ? (svc.location as pulumi.Input<string>)
        : hasProperty(svc, 'location_')
          ? (svc.location_ as pulumi.Input<string>)
          : undefined,
    };
  }
}

/**
 * Cloud Run Job resource handler
 */
export class CloudRunJobResourceHandlerImpl
  implements CloudRunJobResourceHandler
{
  readonly supportedType = 'gcp:cloudrunv2/job:Job' as const;

  extractResourceInfo(resource: unknown): CloudRunJobResourceInfo {
    const jobData = this.getJobData(resource);
    if (!jobData.jobName || !jobData.location) {
      throw new Error('Unable to determine Cloud Run Job name/location');
    }

    return {
      id: jobData.jobName,
      name: jobData.jobName,
      jobName: jobData.jobName,
      location: jobData.location,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getJobData(resource: unknown): {
    jobName?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
  } {
    let job: unknown = resource;
    if (hasMethod(resource, 'getJob')) {
      job = resource.getJob();
    }

    if (job instanceof gcp.cloudrunv2.Job) {
      return {
        jobName: job.name,
        location:
          ((job as unknown as Record<string, unknown>)
            .location as pulumi.Input<string>) ??
          ((job as unknown as Record<string, unknown>)
            .location_ as pulumi.Input<string>),
      };
    }

    return {
      jobName: hasProperty(job, 'name')
        ? (job.name as pulumi.Input<string>)
        : undefined,
      location: hasProperty(job, 'location')
        ? (job.location as pulumi.Input<string>)
        : hasProperty(job, 'location_')
          ? (job.location_ as pulumi.Input<string>)
          : undefined,
    };
  }
}

/**
 * Secret resource handler
 */
export class SecretResourceHandlerImpl implements SecretResourceHandler {
  readonly supportedType = 'gcp:secretmanager/secret:Secret' as const;

  extractResourceInfo(resource: unknown): SecretResourceInfo {
    const secretData = this.getSecretData(resource);
    if (!secretData.secretId) {
      throw new Error('Unable to determine secret ID');
    }

    return {
      id: secretData.secretId,
      name: secretData.secretId,
      secretId: secretData.secretId,
      location: secretData.location,
      project: secretData.project,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getSecretData(resource: unknown): {
    secretId?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    let secretRes: unknown = resource;
    if (hasMethod(resource, 'getSecret')) {
      secretRes = resource.getSecret();
    }

    if (
      secretRes instanceof gcp.secretmanager.RegionalSecret ||
      (hasProperty(secretRes, '__pulumiType') &&
        secretRes.__pulumiType ===
          'gcp:secretmanager/regionalSecret:RegionalSecret')
    ) {
      return {
        secretId: hasProperty(secretRes, 'id')
          ? (secretRes.id as pulumi.Input<string>)
          : hasProperty(secretRes, 'secretId')
            ? (secretRes.secretId as pulumi.Input<string>)
            : undefined,
        location: hasProperty(secretRes, 'location')
          ? (secretRes.location as pulumi.Input<string>)
          : undefined,
        project: hasProperty(secretRes, 'project')
          ? (secretRes.project as pulumi.Input<string>)
          : undefined,
      };
    }

    return {
      secretId: hasProperty(secretRes, 'id')
        ? (secretRes.id as pulumi.Input<string>)
        : hasProperty(secretRes, 'secretId')
          ? (secretRes.secretId as pulumi.Input<string>)
          : undefined,
      project: hasProperty(secretRes, 'project')
        ? (secretRes.project as pulumi.Input<string>)
        : undefined,
    };
  }
}

/**
 * Artifact Registry Repository resource handler
 */
export class RepositoryResourceHandlerImpl
  implements RepositoryResourceHandler
{
  readonly supportedType =
    'gcp:artifactregistry/repository:Repository' as const;

  extractResourceInfo(resource: unknown): RepositoryResourceInfo {
    const repoData = this.getRepositoryData(resource);
    if (!repoData.repositoryId) {
      throw new Error('Unable to determine repository ID');
    }

    return {
      id: repoData.repositoryId,
      name: repoData.repositoryId,
      repositoryId: repoData.repositoryId,
      location: repoData.location,
      project: repoData.project,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getRepositoryData(resource: unknown): {
    repositoryId?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    let repo: unknown = resource;
    if (hasMethod(resource, 'getRepository')) {
      repo = resource.getRepository();
    }

    if (repo instanceof gcp.artifactregistry.Repository) {
      return {
        repositoryId: repo.repositoryId ?? repo.name,
        location:
          ((repo as unknown as Record<string, unknown>)
            .location as pulumi.Input<string>) ??
          ((repo as unknown as Record<string, unknown>)
            .location_ as pulumi.Input<string>),
        project:
          ((repo as unknown as Record<string, unknown>)
            .project as pulumi.Input<string>) ??
          ((repo as unknown as Record<string, unknown>)
            .project_ as pulumi.Input<string>),
      };
    }

    return {
      repositoryId: hasProperty(repo, 'repositoryId')
        ? (repo.repositoryId as pulumi.Input<string>)
        : hasProperty(repo, 'name')
          ? (repo.name as pulumi.Input<string>)
          : undefined,
      location: hasProperty(repo, 'location')
        ? (repo.location as pulumi.Input<string>)
        : undefined,
      project: hasProperty(repo, 'project')
        ? (repo.project as pulumi.Input<string>)
        : undefined,
    };
  }
}

/**
 * Compute Instance resource handler
 */
export class ComputeInstanceResourceHandlerImpl
  implements ComputeInstanceResourceHandler
{
  readonly supportedType = 'gcp:compute/instance:Instance' as const;

  extractResourceInfo(resource: unknown): ComputeInstanceResourceInfo {
    const instanceData = this.getInstanceData(resource);
    if (!instanceData.instanceName || !instanceData.zone) {
      throw new Error('Unable to determine Compute Instance name/zone');
    }

    return {
      id: instanceData.instanceName,
      name: instanceData.instanceName,
      instanceName: instanceData.instanceName,
      zone: instanceData.zone,
      project: instanceData.project,
    };
  }

  createIamBinding(params: IamBindingParams): pulumi.CustomResource {
    return IamBuilderRegistry.createIamBinding(this.supportedType, params);
  }

  private getInstanceData(resource: unknown): {
    instanceName?: pulumi.Input<string>;
    zone?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    let instance: unknown = resource;
    if (hasMethod(resource, 'getInstance')) {
      instance = resource.getInstance();
    }

    if (instance instanceof gcp.compute.Instance) {
      return {
        instanceName: instance.name,
        zone: instance.zone,
        project:
          ((instance as unknown as Record<string, unknown>)
            .project as pulumi.Input<string>) ??
          ((instance as unknown as Record<string, unknown>)
            .project_ as pulumi.Input<string>),
      };
    }

    return {
      instanceName: hasProperty(instance, 'name')
        ? (instance.name as pulumi.Input<string>)
        : undefined,
      zone: hasProperty(instance, 'zone')
        ? (instance.zone as pulumi.Input<string>)
        : undefined,
      project: hasProperty(instance, 'project')
        ? (instance.project as pulumi.Input<string>)
        : undefined,
    };
  }
}
