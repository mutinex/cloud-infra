import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import { IamBindingParams, BucketResourceInfo } from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define a resource type for buckets: either a direct Bucket, a component with getBucket(), or any object with a name property
type BucketComponentResource = { getBucket(): gcp.storage.Bucket };
type BucketResource =
  | gcp.storage.Bucket
  | BucketComponentResource
  | { name: pulumi.Input<string> };

/**
 * IAM builder for GCP Storage Bucket resources
 */
export class BucketIamBuilder implements IamBuilder<BucketResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const bucketInfo = this.extractBucketInfo(resource as BucketResource);

    return new gcp.storage.BucketIAMMember(resourceName, {
      bucket: bucketInfo.bucketName,
      role,
      member,
    });
  }

  private extractBucketInfo(resource: BucketResource): BucketResourceInfo {
    const bucketName = this.getBucketName(resource);

    if (!bucketName) {
      throw new Error(
        'Unable to determine bucket name when creating IAMMember'
      );
    }

    return {
      id: bucketName,
      name: bucketName,
      bucketName,
    };
  }

  private getBucketName(
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
}
