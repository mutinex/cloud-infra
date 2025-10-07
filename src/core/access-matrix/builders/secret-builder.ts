import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import { IamBindingParams, SecretResourceInfo } from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for GCP Secret Manager resources
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

/**
 * IAM builder for GCP Secret Manager resources (both global and regional)
 */
export class SecretIamBuilder implements IamBuilder<SecretResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const secretInfo = this.extractSecretInfo(resource as SecretResource);

    // Determine if this is a regional secret
    if (secretInfo.location) {
      return new gcp.secretmanager.RegionalSecretIamMember(resourceName, {
        secretId: secretInfo.secretId,
        location: secretInfo.location,
        project: secretInfo.project,
        role,
        member,
      });
    }

    // Global secret
    return new gcp.secretmanager.SecretIamMember(resourceName, {
      secretId: secretInfo.secretId,
      role,
      member,
    });
  }

  private extractSecretInfo(resource: SecretResource): SecretResourceInfo {
    const secretData = this.getSecretData(resource);

    if (!secretData.secretId) {
      throw new Error(
        'Unable to determine secret ID when creating SecretIamMember'
      );
    }

    return {
      id: secretData.secretId,
      name: secretData.secretId,
      secretId: secretData.secretId,
      location: secretData.location,
      project: secretData.project,
    };
  }

  private getSecretData(resource: SecretResource): {
    secretId?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., secret component)
    if (hasMethod(resource, 'getSecret')) {
      const secretRes = resource.getSecret();
      return this.extractFromSecret(secretRes);
    }

    // Check if resource is directly a Secret
    if (
      resource instanceof gcp.secretmanager.Secret ||
      resource instanceof gcp.secretmanager.RegionalSecret
    ) {
      return this.extractFromSecret(resource);
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

  private extractFromSecret(
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
}
