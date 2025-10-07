import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { IamBuilder } from './iam-builder-registry';
import {
  IamBindingParams,
  CloudRunServiceResourceInfo,
  CloudRunJobResourceInfo,
} from '../types/common-types';
import { hasMethod, hasProperty } from '../../helpers';

// Define resource types for Cloud Run resources
type CloudRunServiceComponentResource = {
  getService(): gcp.cloudrunv2.Service;
};
type CloudRunServiceResource =
  | gcp.cloudrunv2.Service
  | CloudRunServiceComponentResource
  | {
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

type CloudRunJobComponentResource = { getJob(): gcp.cloudrunv2.Job };
type CloudRunJobResource =
  | gcp.cloudrunv2.Job
  | CloudRunJobComponentResource
  | {
      name?: pulumi.Input<string>;
      location?: pulumi.Input<string>;
      project?: pulumi.Input<string>;
    };

/**
 * IAM builder for GCP Cloud Run Service resources
 */
export class CloudRunServiceIamBuilder
  implements IamBuilder<CloudRunServiceResource>
{
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const serviceInfo = this.extractServiceInfo(
      resource as CloudRunServiceResource
    );

    return new gcp.cloudrunv2.ServiceIamMember(resourceName, {
      project: serviceInfo.project,
      name: serviceInfo.serviceName,
      location: serviceInfo.location,
      role,
      member,
    });
  }

  private extractServiceInfo(
    resource: CloudRunServiceResource
  ): CloudRunServiceResourceInfo {
    const serviceData = this.getServiceData(resource);

    if (!serviceData.serviceName || !serviceData.location) {
      throw new Error(
        'Unable to determine Cloud Run Service name/location when creating IAMMember'
      );
    }

    return {
      id: serviceData.serviceName,
      name: serviceData.serviceName,
      serviceName: serviceData.serviceName,
      location: serviceData.location,
      project: serviceData.project,
    };
  }

  private getServiceData(resource: CloudRunServiceResource): {
    serviceName?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., service component)
    if (hasMethod(resource, 'getService')) {
      const service = resource.getService();
      if (service instanceof gcp.cloudrunv2.Service) {
        return this.extractFromService(service);
      }
    }

    // Check if resource is directly a Service
    if (resource instanceof gcp.cloudrunv2.Service) {
      return this.extractFromService(resource);
    }

    // Fallback to resource properties
    return {
      serviceName: hasProperty(resource, 'name')
        ? (resource.name as pulumi.Input<string>)
        : undefined,
      location: hasProperty(resource, 'location')
        ? (resource.location as pulumi.Input<string>)
        : undefined,
      project: hasProperty(resource, 'project')
        ? (resource.project as pulumi.Input<string>)
        : undefined,
    };
  }

  private extractFromService(service: gcp.cloudrunv2.Service): {
    serviceName: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    return {
      serviceName: service.name,
      location:
        ((service as unknown as Record<string, unknown>)
          .location as pulumi.Input<string>) ??
        ((service as unknown as Record<string, unknown>)
          .location_ as pulumi.Input<string>),
      project:
        ((service as unknown as Record<string, unknown>)
          .project as pulumi.Input<string>) ??
        ((service as unknown as Record<string, unknown>)
          .project_ as pulumi.Input<string>),
    };
  }
}

/**
 * IAM builder for GCP Cloud Run Job resources
 */
export class CloudRunJobIamBuilder implements IamBuilder<CloudRunJobResource> {
  build(params: IamBindingParams): pulumi.CustomResource {
    const { resource, role, member, resourceName } = params;

    const jobInfo = this.extractJobInfo(resource as CloudRunJobResource);

    return new gcp.cloudrunv2.JobIamMember(resourceName, {
      project: jobInfo.project,
      name: jobInfo.jobName,
      location: jobInfo.location,
      role,
      member,
    });
  }

  private extractJobInfo(
    resource: CloudRunJobResource
  ): CloudRunJobResourceInfo {
    const jobData = this.getJobData(resource);

    if (!jobData.jobName || !jobData.location) {
      throw new Error(
        'Unable to determine Cloud Run Job name/location when creating IAMMember'
      );
    }

    return {
      id: jobData.jobName,
      name: jobData.jobName,
      jobName: jobData.jobName,
      location: jobData.location,
      project: jobData.project,
    };
  }

  private getJobData(resource: CloudRunJobResource): {
    jobName?: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    // Try component resource (e.g., job component)
    if (hasMethod(resource, 'getJob')) {
      const job = resource.getJob();
      if (job instanceof gcp.cloudrunv2.Job) {
        return this.extractFromJob(job);
      }
    }

    // Check if resource is directly a Job
    if (resource instanceof gcp.cloudrunv2.Job) {
      return this.extractFromJob(resource);
    }

    // Fallback to resource properties
    return {
      jobName: hasProperty(resource, 'name')
        ? (resource.name as pulumi.Input<string>)
        : undefined,
      location: hasProperty(resource, 'location')
        ? (resource.location as pulumi.Input<string>)
        : undefined,
      project: hasProperty(resource, 'project')
        ? (resource.project as pulumi.Input<string>)
        : undefined,
    };
  }

  private extractFromJob(job: gcp.cloudrunv2.Job): {
    jobName: pulumi.Input<string>;
    location?: pulumi.Input<string>;
    project?: pulumi.Input<string>;
  } {
    return {
      jobName: job.name,
      location:
        ((job as unknown as Record<string, unknown>)
          .location as pulumi.Input<string>) ??
        ((job as unknown as Record<string, unknown>)
          .location_ as pulumi.Input<string>),
      project:
        ((job as unknown as Record<string, unknown>)
          .project as pulumi.Input<string>) ??
        ((job as unknown as Record<string, unknown>)
          .project_ as pulumi.Input<string>),
    };
  }
}
