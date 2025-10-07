import {
  ResourceHandler,
  ResourceHandlerConstructor,
  SupportedResourceType,
  RESOURCE_DISCOVERY_GETTERS,
} from './resource-types';
import {
  ResourceNotSupportedError,
  ResourceTypeDiscoveryError,
} from '../types/common-types';
import { hasProperty } from '../../helpers';

/**
 * Registry for resource handlers that manages resource type discovery and handler creation
 */
export class ResourceRegistry {
  private static readonly handlerMap = new Map<
    string,
    ResourceHandlerConstructor
  >();
  private static readonly instanceCache = new Map<string, ResourceHandler>();

  /**
   * Register a resource handler for a specific Pulumi resource type
   */
  static register<T extends ResourceHandler>(
    pulumiType: SupportedResourceType,
    handlerConstructor: ResourceHandlerConstructor<T>
  ): void {
    this.handlerMap.set(pulumiType, handlerConstructor);
  }

  /**
   * Get a handler instance for the given resource
   */
  static getHandler(resource: unknown): ResourceHandler {
    const pulumiType = this.discoverResourceType(resource);

    // Check cache first
    const cached = this.instanceCache.get(pulumiType);
    if (cached) {
      return cached;
    }

    // Create new instance
    const HandlerConstructor = this.handlerMap.get(pulumiType);
    if (!HandlerConstructor) {
      throw new ResourceNotSupportedError(pulumiType);
    }

    const handler = new HandlerConstructor();
    this.instanceCache.set(pulumiType, handler);
    return handler;
  }

  /**
   * Check if a resource type is supported
   */
  static isSupported(pulumiType: string): boolean {
    return this.handlerMap.has(pulumiType);
  }

  /**
   * Get all registered resource types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.handlerMap.keys());
  }

  /**
   * Clear the instance cache (useful for testing)
   */
  static clearCache(): void {
    this.instanceCache.clear();
  }

  /**
   * Discover the Pulumi resource type from a resource object
   */
  private static discoverResourceType(resource: unknown): string {
    if (!resource || typeof resource !== 'object') {
      throw new ResourceTypeDiscoveryError(resource);
    }

    // Direct Pulumi resource type
    if (
      hasProperty(resource, '__pulumiType') &&
      typeof resource.__pulumiType === 'string'
    ) {
      return resource.__pulumiType;
    }

    // Try component resource getters
    const discoveredType = this.discoverFromComponent(resource);
    if (discoveredType) {
      return discoveredType;
    }

    throw new ResourceTypeDiscoveryError(resource);
  }

  /**
   * Discover resource type from component resources using getter methods
   */
  private static discoverFromComponent(resource: unknown): string | undefined {
    if (!resource || typeof resource !== 'object') {
      return undefined;
    }

    for (const getter of RESOURCE_DISCOVERY_GETTERS) {
      if (
        hasProperty(resource, getter) &&
        typeof resource[getter] === 'function'
      ) {
        try {
          const nestedResource = (resource[getter] as () => unknown)();
          if (
            hasProperty(nestedResource, '__pulumiType') &&
            typeof nestedResource.__pulumiType === 'string'
          ) {
            return nestedResource.__pulumiType;
          }
        } catch {
          // Ignore errors and try next getter
          continue;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract the actual Pulumi resource from a component wrapper
   */
  static extractPulumiResource(resource: unknown): unknown {
    if (!resource || typeof resource !== 'object') {
      return resource;
    }

    // If it's already a Pulumi resource, return as-is
    if (hasProperty(resource, '__pulumiType')) {
      return resource;
    }

    // Try to extract from component using getters
    for (const getter of RESOURCE_DISCOVERY_GETTERS) {
      if (
        hasProperty(resource, getter) &&
        typeof resource[getter] === 'function'
      ) {
        try {
          const extracted = (resource[getter] as () => unknown)();
          if (hasProperty(extracted, '__pulumiType')) {
            return extracted;
          }
        } catch {
          // Ignore errors and try next getter
          continue;
        }
      }
    }

    // Return original if no extraction possible
    return resource;
  }

  /**
   * Get resource name for IAM binding resource naming
   */
  static getResourceName(resource: unknown): string {
    // Try to get name from meta if available
    if (resource && typeof resource === 'object') {
      if (
        hasProperty(resource, 'meta') &&
        hasProperty(resource.meta, 'getName') &&
        typeof resource.meta.getName === 'function'
      ) {
        try {
          const name = (resource.meta.getName as () => unknown)();
          if (typeof name === 'string') {
            return name;
          }
        } catch {
          // Ignore and try other methods
        }
      }

      if (
        hasProperty(resource, 'getName') &&
        typeof resource.getName === 'function'
      ) {
        try {
          const name = (resource.getName as () => unknown)();
          if (typeof name === 'string') {
            return name;
          }
        } catch {
          // Ignore and try other methods
        }
      }
    }

    // Try to get from Pulumi resource internal name - works for both CustomResource and regular resources
    if (resource && typeof resource === 'object') {
      // Try __name first (this fixes the issue with newer Pulumi versions)
      if (
        hasProperty(resource, '__name') &&
        typeof resource.__name === 'string'
      ) {
        return resource.__name;
      }

      // Try other internal name properties for backward compatibility
      if (
        hasProperty(resource, '__pulumiResourceName') &&
        typeof resource.__pulumiResourceName === 'string'
      ) {
        return resource.__pulumiResourceName;
      }

      if (
        hasProperty(resource, '_name') &&
        typeof resource._name === 'string'
      ) {
        return resource._name;
      }

      if (
        hasProperty(resource, '__opts') &&
        hasProperty(resource.__opts, 'name') &&
        typeof resource.__opts.name === 'string'
      ) {
        return resource.__opts.name;
      }
    }

    // Try to get the name from the resource's name property if it's a string
    if (
      resource &&
      typeof resource === 'object' &&
      hasProperty(resource, 'name') &&
      typeof resource.name === 'string'
    ) {
      return resource.name;
    }

    // Fallback to generic name
    return 'unknown-resource';
  }
}
