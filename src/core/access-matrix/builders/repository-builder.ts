import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import {
  IamBindingParams,
  RepositoryResourceInfo,
} from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for Artifact Registry Repository resources
type RepositoryComponentResource = {
  getRepository(): gcp.artifactregistry.Repository;
};
type RepositoryResource =
  | gcp.artifactregistry.Repository
  | RepositoryComponentResource
  | {
      repositoryId?: pulumi.Input<string>;
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

/**
 * IAM builder for Artifact Registry Repository resources
 */
export class RepositoryIamBuilder implements IamBuilder<RepositoryResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const repoInfo = this.extractRepositoryInfo(resource as RepositoryResource);

    return new gcp.artifactregistry.RepositoryIamMember(resourceName, {
      repository: repoInfo.repositoryId,
      location: repoInfo.location,
      project: repoInfo.project,
      role,
      member,
    });
  }

  private extractRepositoryInfo(
    resource: RepositoryResource
  ): RepositoryResourceInfo {
    const repoData = this.getRepositoryData(resource);

    if (!repoData.repositoryId) {
      throw new Error(
        'Unable to determine repositoryId when creating IAMMember'
      );
    }

    return {
      id: repoData.repositoryId,
      name: repoData.repositoryId,
      repositoryId: repoData.repositoryId,
      location: repoData.location,
      project: repoData.project,
    };
  }

  private getRepositoryData(resource: RepositoryResource): {
    repositoryId?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., repository component)
    if (hasMethod(resource, 'getRepository')) {
      const repo = resource.getRepository();
      if (repo instanceof gcp.artifactregistry.Repository) {
        return this.extractFromRepository(repo);
      }
    }

    // Check if resource is directly a Repository
    if (resource instanceof gcp.artifactregistry.Repository) {
      return this.extractFromRepository(resource);
    }

    // Fallback to resource properties
    const repositoryId = hasProperty(resource, 'repositoryId')
      ? (resource.repositoryId as pulumi.Input<string>)
      : hasProperty(resource, 'name')
        ? (resource.name as pulumi.Input<string>)
        : undefined;

    return {
      repositoryId,
      location: hasProperty(resource, 'location')
        ? (resource.location as pulumi.Input<string>)
        : undefined,
      project: hasProperty(resource, 'project')
        ? (resource.project as pulumi.Input<string>)
        : undefined,
    };
  }

  private extractFromRepository(repo: gcp.artifactregistry.Repository): {
    repositoryId: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    return {
      repositoryId: repo.repositoryId,
      location: (repo as unknown as Record<string, unknown>)
        .location as pulumi.Input<string>,
      project: (repo as unknown as Record<string, unknown>)
        .project as pulumi.Input<string>,
    };
  }
}
