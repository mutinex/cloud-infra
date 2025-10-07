import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import {
  IamBindingParams,
  ComputeInstanceResourceInfo,
} from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for Compute Instance resources
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

/**
 * IAM builder for GCP Compute Instance resources
 */
export class ComputeInstanceIamBuilder
  implements IamBuilder<ComputeInstanceResource>
{
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const instanceInfo = this.extractInstanceInfo(
      resource as ComputeInstanceResource
    );

    return new gcp.compute.InstanceIAMMember(resourceName, {
      instanceName: instanceInfo.instanceName,
      zone: instanceInfo.zone,
      project: instanceInfo.project,
      role,
      member,
    });
  }

  private extractInstanceInfo(
    resource: ComputeInstanceResource
  ): ComputeInstanceResourceInfo {
    const instanceData = this.getInstanceData(resource);

    if (!instanceData.instanceName || !instanceData.zone) {
      throw new Error(
        'Unable to determine Compute Instance name/zone when creating IAMMember'
      );
    }

    return {
      id: instanceData.instanceName,
      name: instanceData.instanceName,
      instanceName: instanceData.instanceName,
      zone: instanceData.zone,
      project: instanceData.project,
    };
  }

  private getInstanceData(resource: ComputeInstanceResource): {
    instanceName?: pulumi.Input<string>;
    zone?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., instance component)
    if (hasMethod(resource, 'getInstance')) {
      const instance = resource.getInstance();
      if (instance instanceof gcp.compute.Instance) {
        return this.extractFromInstance(instance);
      }
    }

    // Check if resource is directly an Instance
    if (resource instanceof gcp.compute.Instance) {
      return this.extractFromInstance(resource);
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

  private extractFromInstance(instance: gcp.compute.Instance): {
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
}
