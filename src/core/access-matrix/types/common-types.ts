import * as pulumi from '@pulumi/pulumi';

/**
 * Base error class for all access matrix related errors
 */
export class AccessMatrixError extends Error {
  constructor(
    message: string,
    public readonly context?: unknown
  ) {
    super(message);
    this.name = 'AccessMatrixError';
  }
}

/**
 * Error thrown when an unsupported resource type is encountered
 */
export class ResourceNotSupportedError extends AccessMatrixError {
  constructor(resourceTypeOrMessage: string) {
    const message = resourceTypeOrMessage.includes('Available types:')
      ? resourceTypeOrMessage
      : `Unsupported resource type: ${resourceTypeOrMessage}`;
    super(message, resourceTypeOrMessage);
    this.name = 'ResourceNotSupportedError';
  }
}

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends AccessMatrixError {
  constructor(caseName: string, details: string) {
    super(
      `Configuration validation failed for case '${caseName}': ${details}`,
      { caseName, details }
    );
    this.name = 'ConfigValidationError';
  }
}

/**
 * Error thrown when IAM resource creation fails
 */
export class IamResourceCreationError extends AccessMatrixError {
  constructor(resourceName: string, resourceType: string, cause: Error) {
    super(
      `Failed to create IAM resource '${resourceName}' of type '${resourceType}': ${cause.message}`,
      { resourceName, resourceType, cause }
    );
    this.name = 'IamResourceCreationError';
  }
}

/**
 * Error thrown when principal resolution fails
 */
export class PrincipalResolutionError extends AccessMatrixError {
  constructor(principalIndex: number, cause: Error) {
    super(
      `Failed to resolve principal at index ${principalIndex}: ${cause.message}`,
      { principalIndex, cause }
    );
    this.name = 'PrincipalResolutionError';
  }
}

/**
 * Error thrown when an unsupported principal type is encountered
 */
export class UnsupportedPrincipalError extends AccessMatrixError {
  constructor(principalOrMessage: unknown) {
    const message =
      typeof principalOrMessage === 'string'
        ? principalOrMessage
        : `Unsupported principal type: ${typeof principalOrMessage}`;
    super(message, principalOrMessage);
    this.name = 'UnsupportedPrincipalError';
  }
}

/**
 * Error thrown when resource type cannot be determined
 */
export class ResourceTypeDiscoveryError extends AccessMatrixError {
  constructor(resource: unknown) {
    const resourceInfo =
      resource && typeof resource === 'object'
        ? JSON.stringify(resource).substring(0, 200) + '...'
        : String(resource);
    super(`Cannot determine resource type for: ${resourceInfo}`, resource);
    this.name = 'ResourceTypeDiscoveryError';
  }
}

/**
 * Error thrown when domain-optional resource cannot be found
 */
export class ReferenceWithoutDomainResourceNotFoundError extends AccessMatrixError {
  constructor(resourceType: string, name: string, stack: string) {
    super(
      `Domain-optional resource '${name}' of type '${resourceType}' not found in stack '${stack}'`
    );
    this.name = 'ReferenceWithoutDomainResourceNotFoundError';
  }
}

/**
 * Error thrown when domain-based resource cannot be found
 */
export class ReferenceWithDomainResourceNotFoundError extends AccessMatrixError {
  constructor(
    resourceType: string,
    name: string,
    domain: string,
    stack: string
  ) {
    super(
      `Domain-based resource '${name}' of type '${resourceType}' not found under domain '${domain}' in stack '${stack}'`
    );
    this.name = 'ReferenceWithDomainResourceNotFoundError';
  }
}

/**
 * Base interface for all resource information
 */
export interface ResourceInfo {
  readonly id: pulumi.Input<string>;
  readonly name: pulumi.Input<string>;
  readonly project?: pulumi.Input<string>;
  readonly location?: pulumi.Input<string>;
}

/**
 * Project-specific resource information
 */
export interface ProjectResourceInfo extends ResourceInfo {
  readonly projectId: pulumi.Input<string>;
}

/**
 * Folder-specific resource information
 */
export interface FolderResourceInfo extends ResourceInfo {
  readonly folderId: pulumi.Input<string>;
}

/**
 * Service Account-specific resource information
 */
export interface ServiceAccountResourceInfo extends ResourceInfo {
  readonly serviceAccountId: pulumi.Input<string>;
}

/**
 * Bucket-specific resource information
 */
export interface BucketResourceInfo extends ResourceInfo {
  readonly bucketName: pulumi.Input<string>;
}

/**
 * Subnetwork-specific resource information
 */
export interface SubnetworkResourceInfo extends ResourceInfo {
  readonly subnetworkName: pulumi.Input<string>;
  readonly region: pulumi.Input<string>;
}

/**
 * Cloud Run Service-specific resource information
 */
export interface CloudRunServiceResourceInfo extends ResourceInfo {
  readonly serviceName: pulumi.Input<string>;
  readonly location: pulumi.Input<string>;
}

/**
 * Cloud Run Job-specific resource information
 */
export interface CloudRunJobResourceInfo extends ResourceInfo {
  readonly jobName: pulumi.Input<string>;
  readonly location: pulumi.Input<string>;
}

/**
 * Secret-specific resource information
 */
export interface SecretResourceInfo extends ResourceInfo {
  readonly secretId: pulumi.Input<string>;
  readonly location?: pulumi.Input<string>; // Optional for regional secrets
}

/**
 * Artifact Registry Repository-specific resource information
 */
export interface RepositoryResourceInfo extends ResourceInfo {
  readonly repositoryId: pulumi.Input<string>;
  readonly location?: pulumi.Input<string>;
}

/**
 * Compute Instance-specific resource information
 */
export interface ComputeInstanceResourceInfo extends ResourceInfo {
  readonly instanceName: pulumi.Input<string>;
  readonly zone: pulumi.Input<string>;
}

/**
 * Parameters for creating IAM bindings
 */
export interface IamBindingParams {
  readonly resource: unknown;
  readonly role: pulumi.Input<string>;
  readonly member: pulumi.Input<string>;
  readonly resourceName: string;
}

/**
 * Resolved principal information
 */
export interface ResolvedPrincipal {
  readonly member: pulumi.Input<string>;
  readonly identifier: string;
}

/**
 * Configuration for access matrix cases
 */
export interface AccessMatrixConfig {
  readonly principals: unknown[];
}

/**
 * Performance metrics for access matrix operations
 */
export interface AccessMatrixMetrics {
  readonly processingTimeMs: number;
  readonly caseCount: number;
  readonly ruleCount: number;
  readonly principalCount: number;
  readonly iamResourceCount: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
}
