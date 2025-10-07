import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import { IamBindingParams, FolderResourceInfo } from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for GCP Folder resources
type FolderComponentResource = {
  getFolder(): gcp.organizations.Folder;
};
type FolderResource =
  | gcp.organizations.Folder
  | FolderComponentResource
  | { id?: pulumi.Input<string> };

/**
 * IAM builder for GCP Folder resources
 */
export class FolderIamBuilder implements IamBuilder<FolderResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const folderInfo = this.extractFolderInfo(resource as FolderResource);

    return new gcp.folder.IAMMember(resourceName, {
      folder: folderInfo.folderId,
      role,
      member,
    });
  }

  private extractFolderInfo(resource: FolderResource): FolderResourceInfo {
    const folderId = this.getFolderId(resource);

    if (!folderId) {
      throw new Error('Unable to determine folder id when creating IAMMember');
    }

    return {
      id: folderId,
      name: folderId,
      folderId,
    };
  }

  private getFolderId(
    resource: FolderResource
  ): pulumi.Input<string> | undefined {
    // Try component resource (e.g., folder component)
    if (hasMethod(resource, 'getFolder')) {
      const folder = resource.getFolder();
      if (folder instanceof gcp.organizations.Folder) {
        return folder.id;
      }
    }

    // Check if resource is directly a Folder
    if (resource instanceof gcp.organizations.Folder) {
      return resource.id;
    }

    // Fallback to id property
    if (hasProperty(resource, 'id')) {
      return resource.id as pulumi.Input<string>;
    }

    return undefined;
  }
}
