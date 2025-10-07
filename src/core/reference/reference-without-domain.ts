/**
 * @module @mutinex/cloud-infra/core/reference
 */
import * as pulumi from '@pulumi/pulumi';
import { CloudInfraReference } from './reference-manager';
import type { ReferenceWithoutDomainConfig, ResourceOutput } from './types';

/**
 * Manages references to resources from other Pulumi stacks using domain-optional
 * resolution. This class provides direct stack access without requiring domain
 * scoping, using the simple pattern `root[name]` for direct key-value access.
 *
 * This is designed for scenarios where resources are organized as simple key-value
 * pairs at the stack level without domain-based grouping or resource type organization,
 * enabling simplified retrieval of resource identifiers like service account emails.
 *
 * @example
 * ```ts
 * import { ReferenceWithoutDomain } from "@mutinex/cloud-infra/core/reference";
 *
 * // Create a domain-optional reference to a stack
 * const stackRef = new ReferenceWithoutDomain({
 *   stack: "mutiny-group/accounts/prd",
 * });
 *
 * // Retrieve the email of a service account directly
 * export const saEmail = stackRef.getEmail("keyOfMyAccount");
 * ```
 */
export class ReferenceWithoutDomain {
  private readonly stackRef: pulumi.StackReference;
  private readonly stack: string;

  /**
   * Creates a new `ReferenceWithoutDomain` to access outputs from another Pulumi stack
   * using direct stack access without domain scoping.
   *
   * @param config - The configuration object specifying which stack to target.
   * @throws An error if the `stack` property is not in the required
   *   `organization/project/environment` format.
   */
  constructor({ stack }: ReferenceWithoutDomainConfig) {
    if (stack.split('/').length !== 3) {
      throw new Error(
        "Stack must be in 'organization/project/environment' format (e.g. 'organization/base/dev')"
      );
    }

    this.stack = stack;
    this.stackRef = CloudInfraReference.getStackRef(stack);
  }

  /**
   * Resolves a specific resource from the referenced stack's outputs using
   * direct stack access (domain-optional pattern).
   *
   * This method uses the simple pattern `root[name]` to access values directly
   * from the stack outputs without any domain or resource type scoping.
   *
   * @param name - The key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` that resolves to the raw resource object.
   * @throws An error if the resource cannot be found in the outputs.
   * @private
   */
  private resolve(name: string): pulumi.Output<ResourceOutput> {
    // For domain-optional, access stack outputs directly without any wrapper key
    return this.stackRef.outputs.apply((raw: unknown) => {
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid stack output structure: expected object, got ${typeof raw}`
        );
      }

      const root = raw as Record<string, unknown>;

      // Direct access to string value: root[name]
      const value = root[name];

      if (value === undefined) {
        const availableKeys = Object.keys(root);

        throw new Error(
          `Domain-optional resource '${name}' not found in stack '${this.stack}'. ` +
            `Available keys: [${availableKeys.join(', ')}]`
        );
      }

      if (typeof value !== 'string') {
        throw new Error(
          `Expected string value for '${name}' in stack '${this.stack}', got ${typeof value}`
        );
      }

      // Convert string value to ResourceOutput format
      return this.convertStringToResourceOutput(value);
    });
  }

  /**
   * Converts a string value (email or member format) to ResourceOutput format
   * @param value - The string value from stack outputs
   * @returns ResourceOutput with both email and member properties
   * @private
   */
  private convertStringToResourceOutput(value: string): ResourceOutput {
    let email: string;
    let member: string;

    // Detect format and convert
    if (value.startsWith('serviceAccount:')) {
      // Value is in member format
      member = value;
      email = value.replace('serviceAccount:', '');
    } else {
      // Value is an email
      email = value;
      member = `serviceAccount:${value}`;
    }

    return {
      email,
      member,
      // Include other common properties that might be expected
      id: email, // Use email as fallback ID
      name: email.split('@')[0], // Extract name part from email
    };
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
   * referenced stack's name. This can be useful for creating consistent names
   * for dependent resources.
   *
   * The format is: `{project}-{name}-{environment}`.
   *
   * @param name - The name of the resource (e.g., "keyOfMyAccount").
   * @returns A formatted identifier string.
   */
  public getIdentifier(name: string): string {
    const stackParts = this.stack.split('/'); // org/project/env
    const proj = stackParts[1] ?? 'unkproj';
    const env = stackParts[2] ?? 'unkenv';
    return `${proj}-${name}-${env}`;
  }

  /**
   * Retrieves the complete, raw output object for a resource from the
   * referenced stack using domain-optional resolution.
   *
   * @param name - The key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` containing the full resource object.
   */
  public get(name: string): pulumi.Output<ResourceOutput> {
    return this.resolve(name);
  }

  /**
   * Retrieves the `id` property of a specific resource from the referenced stack.
   *
   * @param name - The key of the resource.
   * @returns A `pulumi.Output` containing the resource's unique ID.
   * @throws An error at runtime if the `id` property does not exist on the
   *   resolved resource object.
   */
  public getId(name: string): pulumi.Output<string> {
    return this.resolve(name).apply(resource => {
      return this.validateResourceProperty(resource, 'id') as string;
    });
  }

  /**
   * Retrieves the `name` property of a specific resource from the referenced stack.
   *
   * @param name - The key of the resource.
   * @returns A `pulumi.Output` containing the resource's name.
   * @throws An error at runtime if the `name` property does not exist on the
   *   resolved resource object.
   */
  public getName(name: string): pulumi.Output<string> {
    return this.resolve(name).apply(resource => {
      return this.validateResourceProperty(resource, 'name') as string;
    });
  }

  /**
   * Retrieves the `email` property of a resource, typically a service account.
   *
   * @param name - The key of the resource.
   * @returns A `pulumi.Output` containing the resource's email address.
   * @throws An error at runtime if the `email` property does not exist on the
   *   resolved resource object.
   */
  public getEmail(name: string): pulumi.Output<string> {
    return this.resolve(name).apply(resource => {
      return this.validateResourceProperty(resource, 'email') as string;
    });
  }

  /**
   * Retrieves the `member` property of a resource, typically an IAM binding.
   *
   * @param name - The key of the resource.
   * @returns A `pulumi.Output` containing the resource's member identifier
   *   (e.g., "serviceAccount:my-sa@...").
   * @throws An error at runtime if the `member` property does not exist on the
   *   resolved resource object.
   */
  public getMember(name: string): pulumi.Output<string> {
    return this.resolve(name).apply(resource => {
      return this.validateResourceProperty(resource, 'member') as string;
    });
  }

  /**
   * Retrieves the `projectId` property of a specific resource from the
   * referenced stack.
   *
   * @param name - The key of the resource.
   * @returns A `pulumi.Output` containing the GCP project ID.
   * @throws An error at runtime if the `projectId` property does not exist on
   *   the resolved resource object.
   */
  public getProjectId(name: string): pulumi.Output<string> {
    return this.resolve(name).apply(resource => {
      return this.validateResourceProperty(resource, 'projectId') as string;
    });
  }
}
