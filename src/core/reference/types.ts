/**
 * @module @mutinex/cloud-infra/core/reference
 */

/**
 * Defines the context for a `CloudInfraReference` instance, specifying the
 * geographical or logical domain to which the reference is scoped.
 */
export interface ReferenceDomain {
  /**
   * The domain identifier (e.g., "au", "us", "gl"). This determines which
   * top-level key to use when looking up outputs in the referenced stack.
   */
  domain: string;
}

/**
 * Configuration options for creating a {@link CloudInfraReference} instance.
 */
export interface ReferenceWithDomainConfig {
  /**
   * The domain identifier (e.g., "au", "us", "gl") to scope the reference to.
   */
  domain: string;

  /**
   * The fully-qualified name of the Pulumi stack to reference, in the format
   * `organization/project/environment`. For example, `mutiny-group/base/prd`.
   */
  stack: string;

  /**
   * The specific output key (version) to retrieve from the stack.
   * This corresponds to the version key used by the `CloudInfraOutput`
   * in the source stack.
   * @default "v1"
   */
  outputKey?: string;
}

/**
 * Configuration options for creating a {@link ReferenceWithoutDomain} instance.
 */
export interface ReferenceWithoutDomainConfig {
  /**
   * The fully-qualified name of the Pulumi stack to reference, in the format
   * `organization/project/environment`. For example, `mutiny-group/base/prd`.
   */
  stack: string;
}

/**
 * Type representing the structure of stack outputs
 */
export interface StackOutputs {
  [domain: string]: {
    [resourceType: string]: {
      [resourceName: string]: ResourceOutput;
    };
  };
}

/**
 * Type representing a resource output with common properties
 */
export interface ResourceOutput {
  id?: string;
  name?: string;
  email?: string;
  member?: string;
  projectId?: string;
  version?: string;
  // [key: string]: unknown;
}
