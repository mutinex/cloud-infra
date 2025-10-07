import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import { IamBindingParams, ProjectResourceInfo } from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for GCP Project resources
type ProjectComponentResource = {
  getProjectId(): pulumi.Input<string>;
};
type ProjectResource =
  | ProjectComponentResource
  | {
      projectId?: pulumi.Input<string>;
      id?: pulumi.Input<string>;
    };

/**
 * IAM builder for GCP Project resources
 */
export class ProjectIamBuilder implements IamBuilder<ProjectResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const projectInfo = this.extractProjectInfo(resource as ProjectResource);

    return new gcp.projects.IAMMember(resourceName, {
      project: projectInfo.projectId,
      role,
      member,
    });
  }

  private extractProjectInfo(resource: ProjectResource): ProjectResourceInfo {
    const projectId = this.getProjectId(resource);

    if (!projectId) {
      throw new Error(
        'Unable to determine projectId for resource when creating IAMMember'
      );
    }

    return {
      id: projectId,
      name: projectId,
      projectId,
    };
  }

  private getProjectId(
    resource: ProjectResource
  ): pulumi.Input<string> | undefined {
    // Try component resource (e.g., project component)
    if (hasMethod(resource, 'getProjectId')) {
      return resource.getProjectId();
    }

    // Try direct projectId property
    if (hasProperty(resource, 'projectId')) {
      return resource.projectId as pulumi.Input<string>;
    }

    // Try id property as fallback
    if (hasProperty(resource, 'id')) {
      return resource.id as pulumi.Input<string>;
    }

    return undefined;
  }
}
