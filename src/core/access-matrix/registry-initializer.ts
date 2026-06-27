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
 * Initialize all resource handlers in the registry.
 * This function registers all supported GCP resource types and their corresponding handlers.
 *
 * IAM-binding dispatch is handled directly by `createIamBinding` (see
 * `./builders/iam-binding`), so only the {@link ResourceRegistry} requires
 * import-time initialization.
 */
export function initializeIamBuilders(): void {
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
 * @returns True if resource handlers are registered
 */
export function isInitialized(): boolean {
  return ResourceRegistry.getRegisteredTypes().length > 0;
}
