import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBindingParams } from '../types/common-types';
import { ResourceNotSupportedError } from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// ---------------------------------------------------------------------------
// Resource type unions (carried over verbatim from the former per-type builders)
// ---------------------------------------------------------------------------

type ProjectComponentResource = {
  getProjectId(): pulumi.Input<string>;
};
type ProjectResource =
  | ProjectComponentResource
  | {
      projectId?: pulumi.Input<string>;
      id?: pulumi.Input<string>;
    };

type FolderComponentResource = {
  getFolder(): gcp.organizations.Folder;
};
type FolderResource =
  | gcp.organizations.Folder
  | FolderComponentResource
  | { id?: pulumi.Input<string> };

type ServiceAccountComponentResource = {
  getServiceAccount(): gcp.serviceaccount.Account;
};
type ServiceAccountResource =
  | gcp.serviceaccount.Account
  | ServiceAccountComponentResource
  | { name?: pulumi.Input<string> };

type BucketComponentResource = { getBucket(): gcp.storage.Bucket };
type BucketResource =
  | gcp.storage.Bucket
  | BucketComponentResource
  | { name: pulumi.Input<string> };

type CloudRunServiceComponentResource = {
  getService(): gcp.cloudrunv2.Service;
};
type CloudRunServiceResource =
  | gcp.cloudrunv2.Service
  | CloudRunServiceComponentResource
  | {
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

type CloudRunJobComponentResource = { getJob(): gcp.cloudrunv2.Job };
type CloudRunJobResource =
  | gcp.cloudrunv2.Job
  | CloudRunJobComponentResource
  | {
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

type SubnetworkComponentResource = {
  getSubnetwork(): gcp.compute.Subnetwork;
};
type SubnetworkResource =
  | gcp.compute.Subnetwork
  | SubnetworkComponentResource
  | {
      name?: pulumi.Input<string>;
      region?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

type ComputeInstanceComponentResource = {
  getInstance(): gcp.compute.Instance;
};
type ComputeInstanceResource =
  | gcp.compute.Instance
  | ComputeInstanceComponentResource
  | {
      name?: pulumi.Input<string>;
      zone?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

type SecretComponentResource = {
  getSecret(): gcp.secretmanager.Secret | gcp.secretmanager.RegionalSecret;
};
type SecretResource =
  | gcp.secretmanager.Secret
  | gcp.secretmanager.RegionalSecret
  | SecretComponentResource
  | {
      id?: pulumi.Input<string>;
      secretId?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
      __pulumiType?: string;
    };

type RepositoryComponentResource = {
  getRepository(): gcp.artifactregistry.Repository;
};
type RepositoryResource =
  | gcp.artifactregistry.Repository
  | RepositoryComponentResource
  | {
      repositoryId?: pulumi.Input<string>;
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

function getProjectId(
  resource: ProjectResource
): pulumi.Input<string> | undefined {
  // Try component resource (e.g., project component)
  if (hasMethod(resource, 'getProjectId')) {
    return resource.getProjectId();
  }

  // Try direct projectId property
  if (hasProperty(resource, 'projectId')) {
    return resource.projectId as pulumi.Input<string>;
  }

  // Try id property as fallback
  if (hasProperty(resource, 'id')) {
    return resource.id as pulumi.Input<string>;
  }

  return undefined;
}

function buildProjectIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const projectId = getProjectId(resource as ProjectResource);

  if (!projectId) {
    throw new Error(
      'Unable to determine projectId for resource when creating IAMMember'
    );
  }

  return new gcp.projects.IAMMember(resourceName, {
    project: projectId,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

function getFolderId(
  resource: FolderResource
): pulumi.Input<string> | undefined {
  // Try component resource (e.g., folder component)
  if (hasMethod(resource, 'getFolder')) {
    const folder = resource.getFolder();
    if (folder instanceof gcp.organizations.Folder) {
      return folder.id;
    }
  }

  // Check if resource is directly a Folder
  if (resource instanceof gcp.organizations.Folder) {
    return resource.id;
  }

  // Fallback to id property
  if (hasProperty(resource, 'id')) {
    return resource.id as pulumi.Input<string>;
  }

  return undefined;
}

function buildFolderIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const folderId = getFolderId(resource as FolderResource);

  if (!folderId) {
    throw new Error('Unable to determine folder id when creating IAMMember');
  }

  return new gcp.folder.IAMMember(resourceName, {
    folder: folderId,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Service Account
// ---------------------------------------------------------------------------

function getServiceAccountId(
  resource: ServiceAccountResource
): pulumi.Input<string> | undefined {
  // Try component resource (e.g., service account component)
  if (hasMethod(resource, 'getServiceAccount')) {
    const sa = resource.getServiceAccount();
    if (sa instanceof gcp.serviceaccount.Account) {
      return sa.name;
    }
  }

  // Check if resource is directly a Service Account
  if (resource instanceof gcp.serviceaccount.Account) {
    return resource.name;
  }

  // Fallback to name property
  if (hasProperty(resource, 'name')) {
    return resource.name as pulumi.Input<string>;
  }

  return undefined;
}

function buildServiceAccountIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const serviceAccountId = getServiceAccountId(
    resource as ServiceAccountResource
  );

  if (!serviceAccountId) {
    throw new Error(
      'Unable to determine service account ID when creating IAMMember'
    );
  }

  return new gcp.serviceaccount.IAMMember(resourceName, {
    serviceAccountId,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Bucket
// ---------------------------------------------------------------------------

function getBucketName(
  resource: BucketResource
): pulumi.Input<string> | undefined {
  // Try component resource (e.g., bucket component)
  if (hasMethod(resource, 'getBucket')) {
    const bucket = resource.getBucket();
    if (bucket instanceof gcp.storage.Bucket) {
      return bucket.name;
    }
  }

  // Check if resource is directly a Bucket
  if (resource instanceof gcp.storage.Bucket) {
    return resource.name;
  }

  // Fallback to name property
  if (hasProperty(resource, 'name')) {
    return resource.name;
  }

  return undefined;
}

function buildBucketIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const bucketName = getBucketName(resource as BucketResource);

  if (!bucketName) {
    throw new Error('Unable to determine bucket name when creating IAMMember');
  }

  return new gcp.storage.BucketIAMMember(resourceName, {
    bucket: bucketName,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Cloud Run Service
// ---------------------------------------------------------------------------

function extractFromService(service: gcp.cloudrunv2.Service): {
  serviceName: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  return {
    serviceName: service.name,
    location:
      ((service as unknown as Record<string, unknown>)
        .location as pulumi.Input<string>) ??
      ((service as unknown as Record<string, unknown>)
        .location_ as pulumi.Input<string>),
    project:
      ((service as unknown as Record<string, unknown>)
        .project as pulumi.Input<string>) ??
      ((service as unknown as Record<string, unknown>)
        .project_ as pulumi.Input<string>),
  };
}

function getServiceData(resource: CloudRunServiceResource): {
  serviceName?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., service component)
  if (hasMethod(resource, 'getService')) {
    const service = resource.getService();
    if (service instanceof gcp.cloudrunv2.Service) {
      return extractFromService(service);
    }
  }

  // Check if resource is directly a Service
  if (resource instanceof gcp.cloudrunv2.Service) {
    return extractFromService(resource);
  }

  // Fallback to resource properties
  return {
    serviceName: hasProperty(resource, 'name')
      ? (resource.name as pulumi.Input<string>)
      : undefined,
    location: hasProperty(resource, 'location')
      ? (resource.location as pulumi.Input<string>)
      : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildCloudRunServiceIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const serviceData = getServiceData(resource as CloudRunServiceResource);

  if (!serviceData.serviceName || !serviceData.location) {
    throw new Error(
      'Unable to determine Cloud Run Service name/location when creating IAMMember'
    );
  }

  return new gcp.cloudrunv2.ServiceIamMember(resourceName, {
    project: serviceData.project,
    name: serviceData.serviceName,
    location: serviceData.location,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Cloud Run Job
// ---------------------------------------------------------------------------

function extractFromJob(job: gcp.cloudrunv2.Job): {
  jobName: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  return {
    jobName: job.name,
    location:
      ((job as unknown as Record<string, unknown>)
        .location as pulumi.Input<string>) ??
      ((job as unknown as Record<string, unknown>)
        .location_ as pulumi.Input<string>),
    project:
      ((job as unknown as Record<string, unknown>)
        .project as pulumi.Input<string>) ??
      ((job as unknown as Record<string, unknown>)
        .project_ as pulumi.Input<string>),
  };
}

function getJobData(resource: CloudRunJobResource): {
  jobName?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., job component)
  if (hasMethod(resource, 'getJob')) {
    const job = resource.getJob();
    if (job instanceof gcp.cloudrunv2.Job) {
      return extractFromJob(job);
    }
  }

  // Check if resource is directly a Job
  if (resource instanceof gcp.cloudrunv2.Job) {
    return extractFromJob(resource);
  }

  // Fallback to resource properties
  return {
    jobName: hasProperty(resource, 'name')
      ? (resource.name as pulumi.Input<string>)
      : undefined,
    location: hasProperty(resource, 'location')
      ? (resource.location as pulumi.Input<string>)
      : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildCloudRunJobIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const jobData = getJobData(resource as CloudRunJobResource);

  if (!jobData.jobName || !jobData.location) {
    throw new Error(
      'Unable to determine Cloud Run Job name/location when creating IAMMember'
    );
  }

  return new gcp.cloudrunv2.JobIamMember(resourceName, {
    project: jobData.project,
    name: jobData.jobName,
    location: jobData.location,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Subnetwork
// ---------------------------------------------------------------------------

function extractFromSubnetwork(subnet: gcp.compute.Subnetwork): {
  subnetworkName: pulumi.Input<string>;
  region: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  return {
    subnetworkName: subnet.name,
    region: subnet.region,
    project: (subnet as unknown as Record<string, unknown>)
      .project as pulumi.Input<string>,
  };
}

function getSubnetworkData(resource: SubnetworkResource): {
  subnetworkName?: pulumi.Input<string>;
  region?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., subnetwork component)
  if (hasMethod(resource, 'getSubnetwork')) {
    const subnet = resource.getSubnetwork();
    if (subnet instanceof gcp.compute.Subnetwork) {
      return extractFromSubnetwork(subnet);
    }
  }

  // Check if resource is directly a Subnetwork
  if (resource instanceof gcp.compute.Subnetwork) {
    return extractFromSubnetwork(resource);
  }

  // Fallback to resource properties
  return {
    subnetworkName: hasProperty(resource, 'name')
      ? (resource.name as pulumi.Input<string>)
      : undefined,
    region: hasProperty(resource, 'region')
      ? (resource.region as pulumi.Input<string>)
      : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildSubnetworkIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const subnetworkData = getSubnetworkData(resource as SubnetworkResource);

  if (!subnetworkData.subnetworkName || !subnetworkData.region) {
    throw new Error(
      'Unable to determine subnetwork name/region when creating IAMMember'
    );
  }

  return new gcp.compute.SubnetworkIAMMember(resourceName, {
    project: subnetworkData.project,
    region: subnetworkData.region,
    subnetwork: subnetworkData.subnetworkName,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Compute Instance
// ---------------------------------------------------------------------------

function extractFromInstance(instance: gcp.compute.Instance): {
  instanceName: pulumi.Input<string>;
  zone: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
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

function getInstanceData(resource: ComputeInstanceResource): {
  instanceName?: pulumi.Input<string>;
  zone?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., instance component)
  if (hasMethod(resource, 'getInstance')) {
    const instance = resource.getInstance();
    if (instance instanceof gcp.compute.Instance) {
      return extractFromInstance(instance);
    }
  }

  // Check if resource is directly an Instance
  if (resource instanceof gcp.compute.Instance) {
    return extractFromInstance(resource);
  }

  // Fallback to resource properties
  return {
    instanceName: hasProperty(resource, 'name')
      ? (resource.name as pulumi.Input<string>)
      : undefined,
    zone: hasProperty(resource, 'zone')
      ? (resource.zone as pulumi.Input<string>)
      : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildComputeInstanceIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const instanceData = getInstanceData(resource as ComputeInstanceResource);

  if (!instanceData.instanceName || !instanceData.zone) {
    throw new Error(
      'Unable to determine Compute Instance name/zone when creating IAMMember'
    );
  }

  return new gcp.compute.InstanceIAMMember(resourceName, {
    instanceName: instanceData.instanceName,
    zone: instanceData.zone,
    project: instanceData.project,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Secret (global + regional share this builder)
// ---------------------------------------------------------------------------

function extractFromSecret(
  secret: gcp.secretmanager.Secret | gcp.secretmanager.RegionalSecret
): {
  secretId: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Check if this is a regional secret
  if (secret instanceof gcp.secretmanager.RegionalSecret) {
    return {
      secretId:
        ((secret as unknown as Record<string, unknown>)
          .id as pulumi.Input<string>) ??
        ((secret as unknown as Record<string, unknown>)
          .secretId as pulumi.Input<string>),
      location: (secret as unknown as Record<string, unknown>)
        .location as pulumi.Input<string>,
      project: (secret as unknown as Record<string, unknown>)
        .project as pulumi.Input<string>,
    };
  }

  // Global secret
  return {
    secretId:
      secret.id ??
      ((secret as unknown as Record<string, unknown>)
        .secretId as pulumi.Input<string>),
    project: (secret as unknown as Record<string, unknown>)
      .project as pulumi.Input<string>,
  };
}

function getSecretData(resource: SecretResource): {
  secretId?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., secret component)
  if (hasMethod(resource, 'getSecret')) {
    const secretRes = resource.getSecret();
    return extractFromSecret(secretRes);
  }

  // Check if resource is directly a Secret
  if (
    resource instanceof gcp.secretmanager.Secret ||
    resource instanceof gcp.secretmanager.RegionalSecret
  ) {
    return extractFromSecret(resource);
  }

  // Fallback to resource properties (including checking __pulumiType)
  const isRegionalSecret =
    hasProperty(resource, '__pulumiType') &&
    resource.__pulumiType ===
      'gcp:secretmanager/regionalSecret:RegionalSecret';

  const secretId = hasProperty(resource, 'id')
    ? (resource.id as pulumi.Input<string>)
    : hasProperty(resource, 'secretId')
      ? (resource.secretId as pulumi.Input<string>)
      : undefined;

  return {
    secretId,
    location:
      isRegionalSecret && hasProperty(resource, 'location')
        ? (resource.location as pulumi.Input<string>)
        : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildSecretIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const secretData = getSecretData(resource as SecretResource);

  if (!secretData.secretId) {
    throw new Error(
      'Unable to determine secret ID when creating SecretIamMember'
    );
  }

  // Determine if this is a regional secret
  if (secretData.location) {
    return new gcp.secretmanager.RegionalSecretIamMember(resourceName, {
      secretId: secretData.secretId,
      location: secretData.location,
      project: secretData.project,
      role,
      member,
    });
  }

  // Global secret
  return new gcp.secretmanager.SecretIamMember(resourceName, {
    secretId: secretData.secretId,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Artifact Registry Repository
// ---------------------------------------------------------------------------

function extractFromRepository(repo: gcp.artifactregistry.Repository): {
  repositoryId: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  return {
    repositoryId: repo.repositoryId,
    location: (repo as unknown as Record<string, unknown>)
      .location as pulumi.Input<string>,
    project: (repo as unknown as Record<string, unknown>)
      .project as pulumi.Input<string>,
  };
}

function getRepositoryData(resource: RepositoryResource): {
  repositoryId?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
} {
  // Try component resource (e.g., repository component)
  if (hasMethod(resource, 'getRepository')) {
    const repo = resource.getRepository();
    if (repo instanceof gcp.artifactregistry.Repository) {
      return extractFromRepository(repo);
    }
  }

  // Check if resource is directly a Repository
  if (resource instanceof gcp.artifactregistry.Repository) {
    return extractFromRepository(resource);
  }

  // Fallback to resource properties
  const repositoryId = hasProperty(resource, 'repositoryId')
    ? (resource.repositoryId as pulumi.Input<string>)
    : hasProperty(resource, 'name')
      ? (resource.name as pulumi.Input<string>)
      : undefined;

  return {
    repositoryId,
    location: hasProperty(resource, 'location')
      ? (resource.location as pulumi.Input<string>)
      : undefined,
    project: hasProperty(resource, 'project')
      ? (resource.project as pulumi.Input<string>)
      : undefined,
  };
}

function buildRepositoryIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;

  const repoData = getRepositoryData(resource as RepositoryResource);

  if (!repoData.repositoryId) {
    throw new Error('Unable to determine repositoryId when creating IAMMember');
  }

  return new gcp.artifactregistry.RepositoryIamMember(resourceName, {
    repository: repoData.repositoryId,
    location: repoData.location,
    project: repoData.project,
    role,
    member,
  });
}

// ---------------------------------------------------------------------------
// Single dispatch entry point
// ---------------------------------------------------------------------------

/**
 * The set of Pulumi type tokens this function knows how to bind IAM members
 * for. Surfaced in the {@link ResourceNotSupportedError} message to preserve
 * the prior "Available types: ..." diagnostic.
 */
const SUPPORTED_RESOURCE_TYPES: readonly string[] = [
  'gcp:organizations/project:Project',
  'gcp:organizations/folder:Folder',
  'gcp:serviceaccount/account:Account',
  'gcp:storage/bucket:Bucket',
  'gcp:cloudrunv2/job:Job',
  'gcp:cloudrunv2/service:Service',
  'gcp:compute/subnetwork:Subnetwork',
  'gcp:compute/instance:Instance',
  'gcp:secretmanager/secret:Secret',
  'gcp:secretmanager/regionalSecret:RegionalSecret',
  'gcp:artifactregistry/repository:Repository',
];

/**
 * Create an IAM binding (a `gcp.*IAMMember` / `gcp.*IamMember` resource) for the
 * supplied Pulumi type token.
 *
 * This replaces the former `IamBuilderRegistry` dispatch table. Each `case`
 * inlines the resource-info extraction and the exact `new gcp.*IAMMember(...)`
 * call the corresponding per-type builder used to perform.
 *
 * @param resourceType - The Pulumi type token of the target resource.
 * @param params - IAM binding parameters (resource, role, member, resourceName).
 * @returns The created Pulumi custom resource.
 * @throws {ResourceNotSupportedError} If `resourceType` is not supported.
 */
export function createIamBinding(
  resourceType: string,
  params: IamBindingParams
): pulumi.CustomResource {
  // Validate parameters (preserved from the former registry entry point)
  if (!params) {
    throw new Error('IAM binding parameters are required');
  }

  if (!params.resource) {
    throw new Error('Resource is required for IAM binding');
  }

  if (!params.role) {
    throw new Error('Role is required for IAM binding');
  }

  if (!params.member) {
    throw new Error('Member is required for IAM binding');
  }

  if (!params.resourceName) {
    throw new Error('Resource name is required for IAM binding');
  }

  switch (resourceType) {
    case 'gcp:organizations/project:Project':
      return buildProjectIamBinding(params);
    case 'gcp:organizations/folder:Folder':
      return buildFolderIamBinding(params);
    case 'gcp:serviceaccount/account:Account':
      return buildServiceAccountIamBinding(params);
    case 'gcp:storage/bucket:Bucket':
      return buildBucketIamBinding(params);
    case 'gcp:cloudrunv2/job:Job':
      return buildCloudRunJobIamBinding(params);
    case 'gcp:cloudrunv2/service:Service':
      return buildCloudRunServiceIamBinding(params);
    case 'gcp:compute/subnetwork:Subnetwork':
      return buildSubnetworkIamBinding(params);
    case 'gcp:compute/instance:Instance':
      return buildComputeInstanceIamBinding(params);
    case 'gcp:secretmanager/secret:Secret':
      return buildSecretIamBinding(params);
    case 'gcp:secretmanager/regionalSecret:RegionalSecret':
      return buildSecretIamBinding(params);
    case 'gcp:artifactregistry/repository:Repository':
      return buildRepositoryIamBinding(params);
    default: {
      const availableTypes = SUPPORTED_RESOURCE_TYPES.join(', ');
      throw new ResourceNotSupportedError(
        `Resource type '${resourceType}' is not supported. Available types: ${availableTypes}`
      );
    }
  }
}
