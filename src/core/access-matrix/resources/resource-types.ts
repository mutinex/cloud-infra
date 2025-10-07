import * as pulumi from '@pulumi/pulumi';
import {
  ResourceInfo,
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

/**
 * Base interface for resource handlers
 */
export interface ResourceHandler<
  T = unknown,
  R extends ResourceInfo = ResourceInfo,
> {
  readonly supportedType: string;
  extractResourceInfo(resource: T): R;
  createIamBinding(params: IamBindingParams): pulumi.CustomResource;
}

/**
 * Project resource handler interface
 */
export interface ProjectResourceHandler
  extends ResourceHandler<unknown, ProjectResourceInfo> {
  readonly supportedType: 'gcp:organizations/project:Project';
}

/**
 * Folder resource handler interface
 */
export interface FolderResourceHandler
  extends ResourceHandler<unknown, FolderResourceInfo> {
  readonly supportedType: 'gcp:organizations/folder:Folder';
}

/**
 * Service Account resource handler interface
 */
export interface ServiceAccountResourceHandler
  extends ResourceHandler<unknown, ServiceAccountResourceInfo> {
  readonly supportedType: 'gcp:serviceaccount/account:Account';
}

/**
 * Bucket resource handler interface
 */
export interface BucketResourceHandler
  extends ResourceHandler<unknown, BucketResourceInfo> {
  readonly supportedType: 'gcp:storage/bucket:Bucket';
}

/**
 * Subnetwork resource handler interface
 */
export interface SubnetworkResourceHandler
  extends ResourceHandler<unknown, SubnetworkResourceInfo> {
  readonly supportedType: 'gcp:compute/subnetwork:Subnetwork';
}

/**
 * Cloud Run Service resource handler interface
 */
export interface CloudRunServiceResourceHandler
  extends ResourceHandler<unknown, CloudRunServiceResourceInfo> {
  readonly supportedType: 'gcp:cloudrunv2/service:Service';
}

/**
 * Cloud Run Job resource handler interface
 */
export interface CloudRunJobResourceHandler
  extends ResourceHandler<unknown, CloudRunJobResourceInfo> {
  readonly supportedType: 'gcp:cloudrunv2/job:Job';
}

/**
 * Secret resource handler interface
 */
export interface SecretResourceHandler
  extends ResourceHandler<unknown, SecretResourceInfo> {
  readonly supportedType:
    | 'gcp:secretmanager/secret:Secret'
    | 'gcp:secretmanager/regionalSecret:RegionalSecret';
}

/**
 * Repository resource handler interface
 */
export interface RepositoryResourceHandler
  extends ResourceHandler<unknown, RepositoryResourceInfo> {
  readonly supportedType: 'gcp:artifactregistry/repository:Repository';
}

/**
 * Compute Instance resource handler interface
 */
export interface ComputeInstanceResourceHandler
  extends ResourceHandler<unknown, ComputeInstanceResourceInfo> {
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
