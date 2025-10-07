import { IamBuilderRegistry } from './builders/iam-builder-registry';
import { ProjectIamBuilder } from './builders/project-builder';
import { FolderIamBuilder } from './builders/folder-builder';
import { ServiceAccountIamBuilder } from './builders/service-account-builder';
import { BucketIamBuilder } from './builders/bucket-builder';
import { SubnetworkIamBuilder } from './builders/subnetwork-builder';
import {
  CloudRunServiceIamBuilder,
  CloudRunJobIamBuilder,
} from './builders/cloudrun-builder';
import { SecretIamBuilder } from './builders/secret-builder';
import { RepositoryIamBuilder } from './builders/repository-builder';
import { ComputeInstanceIamBuilder } from './builders/compute-instance-builder';

import { ResourceRegistry } from './resources/resource-registry';
import {
  ProjectResourceHandlerImpl,
  FolderResourceHandlerImpl,
  ServiceAccountResourceHandlerImpl,
  BucketResourceHandlerImpl,
  SubnetworkResourceHandlerImpl,
  CloudRunServiceResourceHandlerImpl,
  CloudRunJobResourceHandlerImpl,
  SecretResourceHandlerImpl,
  RepositoryResourceHandlerImpl,
  ComputeInstanceResourceHandlerImpl,
} from './resources/resource-handlers';

/**
 * Initialize all IAM builders and resource handlers in the registries.
 * This function registers all supported GCP resource types and their corresponding builders.
 */
export function initializeIamBuilders(): void {
  // Register all IAM builders
  IamBuilderRegistry.register(
    'gcp:organizations/project:Project',
    ProjectIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:organizations/folder:Folder',
    FolderIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:serviceaccount/account:Account',
    ServiceAccountIamBuilder
  );
  IamBuilderRegistry.register('gcp:storage/bucket:Bucket', BucketIamBuilder);
  IamBuilderRegistry.register('gcp:cloudrunv2/job:Job', CloudRunJobIamBuilder);
  IamBuilderRegistry.register(
    'gcp:cloudrunv2/service:Service',
    CloudRunServiceIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:compute/subnetwork:Subnetwork',
    SubnetworkIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:compute/instance:Instance',
    ComputeInstanceIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:secretmanager/secret:Secret',
    SecretIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:secretmanager/regionalSecret:RegionalSecret',
    SecretIamBuilder
  );
  IamBuilderRegistry.register(
    'gcp:artifactregistry/repository:Repository',
    RepositoryIamBuilder
  );

  // Register all resource handlers
  ResourceRegistry.register(
    'gcp:organizations/project:Project',
    ProjectResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:organizations/folder:Folder',
    FolderResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:serviceaccount/account:Account',
    ServiceAccountResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:storage/bucket:Bucket',
    BucketResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:cloudrunv2/job:Job',
    CloudRunJobResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:cloudrunv2/service:Service',
    CloudRunServiceResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:compute/subnetwork:Subnetwork',
    SubnetworkResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:compute/instance:Instance',
    ComputeInstanceResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:secretmanager/secret:Secret',
    SecretResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:secretmanager/regionalSecret:RegionalSecret',
    SecretResourceHandlerImpl
  );
  ResourceRegistry.register(
    'gcp:artifactregistry/repository:Repository',
    RepositoryResourceHandlerImpl
  );
}

/**
 * Check if the registry has been initialized.
 *
 * @returns True if both IAM builders and resource handlers are registered
 */
export function isInitialized(): boolean {
  return (
    IamBuilderRegistry.getRegisteredTypes().length > 0 &&
    ResourceRegistry.getRegisteredTypes().length > 0
  );
}

/**
 * Get initialization status and registered types.
 *
 * @returns Initialization information including registered types and counts
 */
export function getInitializationInfo(): {
  initialized: boolean;
  registeredBuilderTypes: string[];
  registeredResourceTypes: string[];
  builderCount: number;
  resourceHandlerCount: number;
} {
  const registeredBuilderTypes = IamBuilderRegistry.getRegisteredTypes();
  const registeredResourceTypes = ResourceRegistry.getRegisteredTypes();

  return {
    initialized:
      registeredBuilderTypes.length > 0 && registeredResourceTypes.length > 0,
    registeredBuilderTypes,
    registeredResourceTypes,
    builderCount: registeredBuilderTypes.length,
    resourceHandlerCount: registeredResourceTypes.length,
  };
}
