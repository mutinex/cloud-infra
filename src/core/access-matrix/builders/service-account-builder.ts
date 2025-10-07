import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import {
  IamBindingParams,
  ServiceAccountResourceInfo,
} from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for GCP Service Account resources
type ServiceAccountComponentResource = {
  getServiceAccount(): gcp.serviceaccount.Account;
};
type ServiceAccountResource =
  | gcp.serviceaccount.Account
  | ServiceAccountComponentResource
  | { name?: pulumi.Input<string> };

/**
 * IAM builder for GCP Service Account resources
 */
export class ServiceAccountIamBuilder
  implements IamBuilder<ServiceAccountResource>
{
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const serviceAccountInfo = this.extractServiceAccountInfo(
      resource as ServiceAccountResource
    );

    return new gcp.serviceaccount.IAMMember(resourceName, {
      serviceAccountId: serviceAccountInfo.serviceAccountId,
      role,
      member,
    });
  }

  private extractServiceAccountInfo(
    resource: ServiceAccountResource
  ): ServiceAccountResourceInfo {
    const serviceAccountId = this.getServiceAccountId(resource);

    if (!serviceAccountId) {
      throw new Error(
        'Unable to determine service account ID when creating IAMMember'
      );
    }

    return {
      id: serviceAccountId,
      name: serviceAccountId,
      serviceAccountId,
    };
  }

  private getServiceAccountId(
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
}
