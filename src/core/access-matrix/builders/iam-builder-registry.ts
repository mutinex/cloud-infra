import * as pulumi from '@pulumi/pulumi';
import { IamBindingParams } from '../types/common-types';
import { ResourceNotSupportedError } from '../types/common-types';
import { accessMatrixConfig } from '../../../config';
import { CloudInfraLogger } from '../../logging';

/**
 * Interface for IAM builders
 */
export interface IamBuilder<T = unknown> {
  build(params: IamBindingParams & { resource: T }): pulumi.CustomResource;
}

/**
 * Constructor type for IAM builders
 */
export type IamBuilderConstructor = new () => IamBuilder;

/**
 * Registry for IAM builders that manages builder creation for different resource types
 */
export class IamBuilderRegistry {
  private static readonly builderMap = new Map<string, IamBuilderConstructor>();
  private static readonly instanceCache = new Map<string, IamBuilder>();

  /**
   * Register an IAM builder for a specific resource type
   */
  static register(
    resourceType: string,
    builderConstructor: IamBuilderConstructor
  ): void {
    this.builderMap.set(resourceType, builderConstructor);
  }

  /**
   * Get a builder instance for the given resource type
   */
  static getBuilder(resourceType: string): IamBuilder {
    // Validate input
    if (!resourceType || typeof resourceType !== 'string') {
      throw new Error('Resource type must be a non-empty string');
    }

    // Check cache first
    const cached = this.instanceCache.get(resourceType);
    if (cached) {
      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Using cached builder for resource type '${resourceType}'`,
          { component: 'access-matrix', operation: 'builder-registry' }
        );
      }
      return cached;
    }

    // Create new instance
    const BuilderConstructor = this.builderMap.get(resourceType);
    if (!BuilderConstructor) {
      const availableTypes = Array.from(this.builderMap.keys()).join(', ');
      throw new ResourceNotSupportedError(
        `Resource type '${resourceType}' is not supported. Available types: ${availableTypes}`
      );
    }

    try {
      const builder = new BuilderConstructor();
      this.instanceCache.set(resourceType, builder);

      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Created new builder instance for resource type '${resourceType}'`,
          { component: 'access-matrix', operation: 'builder-registry' }
        );
      }

      return builder;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to create IAM builder for resource type '${resourceType}': ${errorMessage}`
      );
    }
  }

  /**
   * Check if a resource type has a registered builder
   */
  static hasBuilder(resourceType: string): boolean {
    return this.builderMap.has(resourceType);
  }

  /**
   * Get all registered resource types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.builderMap.keys());
  }

  /**
   * Clear the instance cache (useful for testing)
   */
  static clearCache(): void {
    this.instanceCache.clear();
  }

  /**
   * Create an IAM binding using the appropriate builder
   */
  static createIamBinding(
    resourceType: string,
    params: IamBindingParams
  ): pulumi.CustomResource {
    // Validate parameters
    if (!params) {
      throw new Error('IAM binding parameters are required');
    }

    if (!params.resource) {
      throw new Error('Resource is required for IAM binding');
    }

    if (!params.role) {
      throw new Error('Role is required for IAM binding');
    }

    if (!params.member) {
      throw new Error('Member is required for IAM binding');
    }

    if (!params.resourceName) {
      throw new Error('Resource name is required for IAM binding');
    }

    try {
      const builder = this.getBuilder(resourceType);

      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Creating IAM binding '${params.resourceName}' for resource type '${resourceType}'`,
          { component: 'access-matrix', operation: 'iam-binding-creation' }
        );
      }

      return builder.build(params);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to create IAM binding '${params.resourceName}' for resource type '${resourceType}': ${errorMessage}`
      );
    }
  }
}
