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

// NOTE: These handler classes are intentionally minimal. The ONLY live member is
// `supportedType`, which is read on the IAM-creation path via
// `ResourceRegistry.getHandler(resource).supportedType` (see
// `core/policy-rule-processor.ts`) and feeds IAM resource naming (v2 redesign
// notes §3 Trap 2). The previous instance-level `extractResourceInfo` and
// `createIamBinding` methods (plus their private getters) were dead code: the
// live path calls the `createIamBinding` switch in `builders/iam-binding.ts`
// directly, and `extractResourceInfo` was only referenced from tests. They were removed in the
// Phase 3 dead-code excision. Do NOT delete `supportedType` or the registrations.

/**
 * Project resource handler
 */
export class ProjectResourceHandlerImpl implements ProjectResourceHandler {
  readonly supportedType = 'gcp:organizations/project:Project' as const;
}

/**
 * Folder resource handler
 */
export class FolderResourceHandlerImpl implements FolderResourceHandler {
  readonly supportedType = 'gcp:organizations/folder:Folder' as const;
}

/**
 * Service Account resource handler
 */
export class ServiceAccountResourceHandlerImpl
  implements ServiceAccountResourceHandler
{
  readonly supportedType = 'gcp:serviceaccount/account:Account' as const;
}

/**
 * Bucket resource handler
 */
export class BucketResourceHandlerImpl implements BucketResourceHandler {
  readonly supportedType = 'gcp:storage/bucket:Bucket' as const;
}

/**
 * Subnetwork resource handler
 */
export class SubnetworkResourceHandlerImpl
  implements SubnetworkResourceHandler
{
  readonly supportedType = 'gcp:compute/subnetwork:Subnetwork' as const;
}

/**
 * Cloud Run Service resource handler
 */
export class CloudRunServiceResourceHandlerImpl
  implements CloudRunServiceResourceHandler
{
  readonly supportedType = 'gcp:cloudrunv2/service:Service' as const;
}

/**
 * Cloud Run Job resource handler
 */
export class CloudRunJobResourceHandlerImpl
  implements CloudRunJobResourceHandler
{
  readonly supportedType = 'gcp:cloudrunv2/job:Job' as const;
}

/**
 * Secret resource handler
 */
export class SecretResourceHandlerImpl implements SecretResourceHandler {
  readonly supportedType = 'gcp:secretmanager/secret:Secret' as const;
}

/**
 * Artifact Registry Repository resource handler
 */
export class RepositoryResourceHandlerImpl
  implements RepositoryResourceHandler
{
  readonly supportedType =
    'gcp:artifactregistry/repository:Repository' as const;
}

/**
 * Compute Instance resource handler
 */
export class ComputeInstanceResourceHandlerImpl
  implements ComputeInstanceResourceHandler
{
  readonly supportedType = 'gcp:compute/instance:Instance' as const;
}
