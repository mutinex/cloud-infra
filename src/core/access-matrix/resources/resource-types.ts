/**
 * Base interface for resource handlers.
 *
 * Only `supportedType` is live: it is read on the IAM-creation path via
 * `ResourceRegistry.getHandler(resource).supportedType` and feeds IAM naming
 * (v2 redesign notes §3 Trap 2). The former `extractResourceInfo`/
 * `createIamBinding` members (and their generic `T`/`R` params) were dead — the
 * live path uses the `createIamBinding` switch in `builders/iam-binding.ts`
 * directly — and were removed in the Phase 3 dead-code excision. The per-resource
 * `*ResourceInfo` shapes remain live: they are used by `builders/iam-binding.ts`.
 */
export interface ResourceHandler {
  readonly supportedType: string;
}

/**
 * Project resource handler interface
 */
export interface ProjectResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:organizations/project:Project';
}

/**
 * Folder resource handler interface
 */
export interface FolderResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:organizations/folder:Folder';
}

/**
 * Service Account resource handler interface
 */
export interface ServiceAccountResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:serviceaccount/account:Account';
}

/**
 * Bucket resource handler interface
 */
export interface BucketResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:storage/bucket:Bucket';
}

/**
 * Subnetwork resource handler interface
 */
export interface SubnetworkResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:compute/subnetwork:Subnetwork';
}

/**
 * Cloud Run Service resource handler interface
 */
export interface CloudRunServiceResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:cloudrunv2/service:Service';
}

/**
 * Cloud Run Job resource handler interface
 */
export interface CloudRunJobResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:cloudrunv2/job:Job';
}

/**
 * Secret resource handler interface
 */
export interface SecretResourceHandler extends ResourceHandler {
  readonly supportedType:
    | 'gcp:secretmanager/secret:Secret'
    | 'gcp:secretmanager/regionalSecret:RegionalSecret';
}

/**
 * Repository resource handler interface
 */
export interface RepositoryResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:artifactregistry/repository:Repository';
}

/**
 * Compute Instance resource handler interface
 */
export interface ComputeInstanceResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:compute/instance:Instance';
}

/**
 * Union type of all supported resource handlers
 */
export type SupportedResourceHandler =
  | ProjectResourceHandler
  | FolderResourceHandler
  | ServiceAccountResourceHandler
  | BucketResourceHandler
  | SubnetworkResourceHandler
  | CloudRunServiceResourceHandler
  | CloudRunJobResourceHandler
  | SecretResourceHandler
  | RepositoryResourceHandler
  | ComputeInstanceResourceHandler;

/**
 * Resource handler constructor type
 */
export type ResourceHandlerConstructor<
  T extends ResourceHandler = ResourceHandler,
> = new () => T;

/**
 * Supported Pulumi resource types
 */
export const SUPPORTED_RESOURCE_TYPES = [
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
] as const;

export type SupportedResourceType = (typeof SUPPORTED_RESOURCE_TYPES)[number];

/**
 * Resource discovery getters for component resources
 */
export const RESOURCE_DISCOVERY_GETTERS = [
  'getProject',
  'getFolder',
  'getServiceAccount',
  'getBucket',
  'getJob',
  'getService',
  'getSecret',
  'getRepository',
  'getSubnetwork',
  'getInstance',
] as const;

export type ResourceDiscoveryGetter =
  (typeof RESOURCE_DISCOVERY_GETTERS)[number];
