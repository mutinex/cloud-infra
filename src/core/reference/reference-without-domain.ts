/**
 * @module @mutinex/cloud-infra/core/reference
 */
import * as pulumi from '@pulumi/pulumi';
import { CloudInfraReference } from './reference-manager';
import type { ReferenceWithoutDomainConfig, ResourceOutput } from './types';

/**
 * Manages references to resources from another Pulumi stack using
 * domain-optional resolution (the flat `root[name]` pattern).
 *
 * @deprecated This is now a thin shim over {@link CloudInfraReference} in its
 * domain-optional mode. Prefer constructing `CloudInfraReference` directly
 * without a domain:
 *
 * ```ts
 * const ref = new CloudInfraReference("organization/accounts/prd");
 * export const saEmail = ref.get("keyOfMyAccount").email;
 * ```
 *
 * All logic (string email/member sniffing, `getIdentifier` format, error
 * messages) lives in `CloudInfraReference`; this class only forwards to it so
 * existing imports keep resolving.
 *
 * @example
 * ```ts
 * import { ReferenceWithoutDomain } from "@mutinex/cloud-infra/core/reference";
 *
 * const stackRef = new ReferenceWithoutDomain({
 *   stack: "mutiny-group/accounts/prd",
 * });
 *
 * export const saEmail = stackRef.getEmail("keyOfMyAccount");
 * ```
 */
export class ReferenceWithoutDomain {
  private readonly ref: CloudInfraReference;

  /**
   * Creates a new `ReferenceWithoutDomain`.
   *
   * @deprecated Use `new CloudInfraReference(stack)` (domain omitted) instead.
   * @param config - `{ stack }`. The stack must be in
   *   `organization/project/environment` format.
   * @throws An error if `stack` is not in 3-part form.
   */
  constructor({ stack }: ReferenceWithoutDomainConfig) {
    if (stack.split('/').length !== 3) {
      throw new Error(
        "Stack must be in 'organization/project/environment' format (e.g. 'organization/base/dev')"
      );
    }
    // Domain omitted → CloudInfraReference enters domain-optional mode and
    // carries the merged flat-output resolution logic.
    this.ref = new CloudInfraReference(stack);
  }

  /**
   * Generates the standardized identifier string `{project}-{name}-{environment}`.
   * @deprecated Use `new CloudInfraReference(stack).get(name).identifier`.
   */
  public getIdentifier(name: string): string {
    return this.ref.getIdentifier(name);
  }

  /**
   * Retrieves the complete, raw output object for a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).raw`.
   */
  public get(name: string): pulumi.Output<ResourceOutput> {
    return this.ref.get(name).raw;
  }

  /**
   * Retrieves the `id` property of a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).id`.
   */
  public getId(name: string): pulumi.Output<string> {
    return this.ref.get(name).id;
  }

  /**
   * Retrieves the `name` property of a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).name`.
   */
  public getName(name: string): pulumi.Output<string> {
    return this.ref.get(name).name;
  }

  /**
   * Retrieves the `email` property of a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).email`.
   */
  public getEmail(name: string): pulumi.Output<string> {
    return this.ref.get(name).email;
  }

  /**
   * Retrieves the `member` property of a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).member`.
   */
  public getMember(name: string): pulumi.Output<string> {
    return this.ref.get(name).member;
  }

  /**
   * Retrieves the `projectId` property of a resource.
   * @deprecated Use `new CloudInfraReference(stack).get(name).projectId`.
   */
  public getProjectId(name: string): pulumi.Output<string> {
    return this.ref.get(name).projectId;
  }
}
