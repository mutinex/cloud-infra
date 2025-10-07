/**
 * @module @mutinex/cloud-infra/core/reference
 */
import * as pulumi from '@pulumi/pulumi';
import * as crypto from 'crypto';
import { getDefaultOutputKey, resourceTypeMap } from './config';
import type {
  ReferenceDomain,
  ReferenceWithDomainConfig,
  ResourceOutput,
  StackOutputs,
} from './types';

/**
 * Manages references to resources from other Pulumi stacks, providing a simplified
 * and consistent interface for consuming their outputs.
 *
 * This class builds on `pulumi.StackReference` to offer a more opinionated,
 * type-safe, and developer-friendly API. It handles the retrieval and caching
 * of stack outputs and provides strongly-typed accessors for common resource
 * properties. It assumes that the source stack was structured using
 * {@link @mutinex/cloud-infra/core/output#CloudInfraOutput}.
 *
 * @example
 * ```ts
 * import { CloudInfraReference } from "@mutinex/cloud-infra/core/reference";
 *
 * // Create a reference to a specific domain within a foundation stack.
 * const foundation = new CloudInfraReference({
 *   stack: "mutiny-group/foundation/prd",
 *   domain: "au",
 * });
 *
 * // Retrieve the ID of a VPC network from the referenced stack.
 * export const vpcId = foundation.getId("network", "default");
 *
 * // Retrieve the email of a service account.
 * export const saEmail = foundation.getEmail("service-account", "my-app");
 * ```
 */
export class CloudInfraReference {
  private readonly outputKey: string;
  // Store only the StackReference; fetch outputs on demand so we always
  // get the latest values from the target stack instead of relying on a
  // potentially stale cached object.
  private readonly stackRef: pulumi.StackReference;
  private readonly domain: ReferenceDomain;
  private readonly stack: string;

  /**
   * Caches `pulumi.StackReference` instances to avoid creating duplicates for
   * the same stack within a single Pulumi program. The cache key is the
   * fully-qualified stack name.
   * @private
   */
  private static stackRefCache = new Map<string, pulumi.StackReference>();

  /**
   * Maximum number of cached stack references. When exceeded, the least recently
   * used entries will be evicted.
   * @private
   */
  private static readonly maxCacheSize = 100;

  /**
   * Track access order for LRU eviction
   * @private
   */
  private static cacheAccessOrder: string[] = [];

  /**
   * Generates a unique, collision-resistant name for a StackReference.
   * Uses a hash to ensure uniqueness while keeping the name readable.
   *
   * @param stack - The fully-qualified stack name
   * @returns A safe, unique name for the StackReference
   * @private
   */
  private static generateSafeName(stack: string): string {
    // Create a short hash of the full stack name to ensure uniqueness
    const hash = crypto
      .createHash('sha256')
      .update(stack)
      .digest('hex')
      .substring(0, 8);

    // Create a readable prefix from the stack name
    const parts = stack.split('/');
    const pulumiProject = parts.join('-').replace(/[^A-Za-z0-9_-]/g, '-');

    // Combine for both readability and uniqueness
    return `stackRef-${pulumiProject}-${hash}`;
  }

  /**
   * Updates the LRU access order for cache management
   * @param key - The cache key that was accessed
   * @private
   */
  private static updateAccessOrder(key: string): void {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(key);
  }

  /**
   * Evicts the least recently used cache entries if the cache size exceeds the maximum
   * @private
   */
  private static evictIfNeeded(): void {
    while (
      this.stackRefCache.size >= this.maxCacheSize &&
      this.cacheAccessOrder.length > 0
    ) {
      const lruKey = this.cacheAccessOrder.shift();
      if (lruKey) {
        this.stackRefCache.delete(lruKey);
      }
    }
  }

  /**
   * Retrieves a `pulumi.StackReference` from the cache or creates a new one
   * if it doesn't exist. This ensures that multiple `CloudInfraReference` instances
   * pointing to the same stack reuse the same underlying `StackReference` object.
   *
   * @param stack - The fully-qualified name of the stack in the format
   *   `organization/project/environment`.
   * @returns A `pulumi.StackReference` instance.
   * @private
   */
  public static getStackRef(stack: string): pulumi.StackReference {
    const cached = this.stackRefCache.get(stack);
    if (cached) {
      this.updateAccessOrder(stack);
      return cached;
    }

    // Evict LRU entries if needed before adding new one
    this.evictIfNeeded();

    const safeName = this.generateSafeName(stack);
    const ref = new pulumi.StackReference(safeName, { name: stack });

    this.stackRefCache.set(stack, ref);
    this.updateAccessOrder(stack);

    return ref;
  }

  /**
   * Clears the entire stack reference cache. Useful for testing or
   * when you need to force fresh references.
   * @public
   */
  public static clearCache(): void {
    this.stackRefCache.clear();
    this.cacheAccessOrder = [];
  }

  /**
   * Gets the current cache size for monitoring purposes
   * @returns The number of cached stack references
   * @public
   */
  public static getCacheSize(): number {
    return this.stackRefCache.size;
  }

  /**
   * Creates a new `CloudInfraReference` to access outputs from another Pulumi stack.
   *
   * @param config - The configuration object specifying which stack and domain
   *   to target. See {@link ReferenceWithDomainConfig}.
   * @throws An error if the `stack` property is not in the required
   *   `organization/project/environment` format.
   */
  constructor({
    domain,
    stack,
    outputKey = getDefaultOutputKey(),
  }: ReferenceWithDomainConfig) {
    if (stack.split('/').length !== 3) {
      throw new Error(
        "Stack must be in 'organization/project/environment' format"
      );
    }

    this.stack = stack;
    this.domain = { domain };
    this.outputKey = outputKey;

    // Cache the StackReference
    this.stackRef = CloudInfraReference.getStackRef(stack);
  }

  /**
   * Resolves a specific resource from the referenced stack's outputs based on
   * its type, name, and the configured domain.
   *
   * This is the core internal method for data retrieval. It uses a map of
   * aliases (e.g., "sa" -> "gcp:serviceaccount:Account") to simplify lookups.
   *
   * @param resourceType - The type of the resource to resolve. Can be a short
   *   alias (e.g., "bucket") or the full Pulumi type name.
   * @param name - The grouping key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` that resolves to the raw resource object.
   * @throws An error if the resource cannot be found in the outputs.
   * @private
   */
  private resolve(
    resourceType: string,
    name: string
  ): pulumi.Output<ResourceOutput> {
    const { domain } = this.domain;
    const normalizedType = resourceType.toLowerCase();
    const fullType = resourceTypeMap[normalizedType] ?? resourceType;

    return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
      // Type guard to ensure we have the expected structure
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid stack output structure: expected object, got ${typeof raw}`
        );
      }

      const root = raw as StackOutputs;
      const resource = root?.[domain]?.[fullType]?.[name];

      if (resource === undefined) {
        throw new Error(
          `Resource '${name}' of type '${fullType}' not found under domain '${domain}'.`
        );
      }

      return resource;
    });
  }

  /**
   * Validates that a resource has the expected property
   * @param resource - The resource object to validate
   * @param property - The property name to check
   * @returns The property value
   * @throws An error if the property is missing
   * @private
   */
  private validateResourceProperty<T extends keyof ResourceOutput>(
    resource: ResourceOutput,
    property: T
  ): NonNullable<ResourceOutput[T]> {
    const value = resource[property];
    if (value === undefined || value === null) {
      throw new Error(
        `Property '${String(property)}' not found on fetched resource`
      );
    }
    return value as NonNullable<ResourceOutput[T]>;
  }

  /**
   * Generates a standardized identifier string for a resource, derived from the
   * referenced stack's name and the current context. This can be useful for
   * creating consistent names for dependent resources.
   *
   * The format is: `{project}-{name}-{environment}-{domain}`.
   *
   * @param name - The name of the resource (e.g., "default-vpc").
   * @returns A formatted identifier string.
   */
  public getIdentifier(name: string): string {
    const stackParts = this.stack.split('/'); // org/project/env
    const proj = stackParts[1] ?? 'unkproj';
    const env = stackParts[2] ?? 'unkenv';
    const { domain } = this.domain;
    return `${proj}-${name}-${env}-${domain}`;
  }

  /**
   * Retrieves the complete, raw output object for a resource from the
   * referenced stack.
   *
   * @param resourceType - The type of the resource, which can be a short alias
   *   (e.g., "sa") or the full Pulumi type (e.g., "gcp:serviceaccount:Account").
   * @param name - The grouping key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` containing the full resource object.
   */
  public get(
    resourceType: string,
    name: string
  ): pulumi.Output<ResourceOutput> {
    return this.resolve(resourceType, name);
  }

  /**
   * Retrieves the `id` property of a specific resource from the referenced stack.
   *
   * @param resourceType - The resource's type alias (e.g., "bucket").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's unique ID.
   * @throws An error at runtime if the `id` property does not exist on the
   *   resolved resource object.
   */
  public getId(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'id') as string;
    });
  }

  /**
   * Retrieves the `name` property of a specific resource from the referenced stack.
   *
   * @param resourceType - The resource's type alias (e.g., "bucket").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's name.
   * @throws An error at runtime if the `name` property does not exist on the
   *   resolved resource object.
   */
  public getName(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'name') as string;
    });
  }

  /**
   * Retrieves the `email` property of a resource, typically a service account.
   *
   * @param resourceType - The resource's type alias (e.g., "sa").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's email address.
   * @throws An error at runtime if the `email` property does not exist on the
   *   resolved resource object.
   */
  public getEmail(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'email') as string;
    });
  }

  /**
   * Retrieves the `member` property of a resource, typically an IAM binding.
   *
   * @param resourceType - The resource's type alias.
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's member identifier
   *   (e.g., "serviceAccount:my-sa@...").
   * @throws An error at runtime if the `member` property does not exist on the
   *   resolved resource object.
   */
  public getMember(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'member') as string;
    });
  }

  /**
   * Retrieves the `projectId` property of a specific resource from the
   * referenced stack.
   *
   * @param resourceType - The resource's type alias (e.g., "project").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the GCP project ID.
   * @throws An error at runtime if the `projectId` property does not exist on
   *   the resolved resource object.
   */
  public getProjectId(
    resourceType: string,
    name: string
  ): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'projectId') as string;
    });
  }

  public getVersion(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'version') as string;
    });
  }
}
