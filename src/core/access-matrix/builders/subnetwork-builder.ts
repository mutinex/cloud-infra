import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import {
  IamBindingParams,
  SubnetworkResourceInfo,
} from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for GCP Subnetwork resources
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

/**
 * IAM builder for GCP Subnetwork resources
 */
export class SubnetworkIamBuilder implements IamBuilder<SubnetworkResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const subnetworkInfo = this.extractSubnetworkInfo(
      resource as SubnetworkResource
    );

    return new gcp.compute.SubnetworkIAMMember(resourceName, {
      project: subnetworkInfo.project,
      region: subnetworkInfo.region,
      subnetwork: subnetworkInfo.subnetworkName,
      role,
      member,
    });
  }

  private extractSubnetworkInfo(
    resource: SubnetworkResource
  ): SubnetworkResourceInfo {
    const subnetworkData = this.getSubnetworkData(resource);

    if (!subnetworkData.subnetworkName || !subnetworkData.region) {
      throw new Error(
        'Unable to determine subnetwork name/region when creating IAMMember'
      );
    }

    return {
      id: subnetworkData.subnetworkName,
      name: subnetworkData.subnetworkName,
      subnetworkName: subnetworkData.subnetworkName,
      region: subnetworkData.region,
      project: subnetworkData.project,
    };
  }

  private getSubnetworkData(resource: SubnetworkResource): {
    subnetworkName?: pulumi.Input<string>;
    region?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., subnetwork component)
    if (hasMethod(resource, 'getSubnetwork')) {
      const subnet = resource.getSubnetwork();
      if (subnet instanceof gcp.compute.Subnetwork) {
        return this.extractFromSubnetwork(subnet);
      }
    }

    // Check if resource is directly a Subnetwork
    if (resource instanceof gcp.compute.Subnetwork) {
      return this.extractFromSubnetwork(resource);
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

  private extractFromSubnetwork(subnet: gcp.compute.Subnetwork): {
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
}
