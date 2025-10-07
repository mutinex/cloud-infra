import * as pulumi from '@pulumi/pulumi';
import { CloudInfraRole } from '../../../components/role';
import {
  MatrixPolicyRule,
  MatrixRoleInput,
  MatrixUseCase,
  PolicyRuleProcessingContext,
  BulkResource,
  MatrixResource,
  AllPrincipalTypes,
} from '../types/matrix-types';
import { AccessMatrixConfig, ResolvedPrincipal } from '../types/common-types';
import { PrincipalFactory } from '../principals/principal-factory';
import { ResourceRegistry } from '../resources/resource-registry';
import { IamBuilderRegistry } from '../builders/iam-builder-registry';
import { hasMethod } from '../../helpers';
import { CloudInfraLogger } from '../../logging';
import { accessMatrixConfig } from '../../../config';

/**
 * @public
 * Processes access matrix policy rules and creates IAM resources.
 *
 * This is the core engine of the access matrix system. It takes a normalized
 * use case, resolves the effective principals from various sources (config,
 * case-level, and rule-level), and then iterates through each rule to
 * create the appropriate IAM resources using the registered IAM builders.
 *
 * It also handles special cases like bulk resources, ensuring that policy rules
 * are applied to all sub-resources correctly.
 *
 * Handles both case-level and rule-level principals with automatic deduplication.
 */
export class PolicyRuleProcessor {
  /**
   * Process a use case and return created IAM members.
   *
   * @param useCase - The use case containing policy rules and optional case-level principals.
   * @param config - Configuration containing principals from Pulumi config. This is used
   *               to provide a global set of principals for a given case.
   * @param caseName - Name of the case for logging and debugging purposes. This name is
   *                 used in log messages to identify which case is being processed.
   * @returns Array of created IAM member resources, which are Pulumi custom resources.
   */
  processUseCase(
    useCase: MatrixUseCase,
    config: AccessMatrixConfig,
    caseName: string = 'unknown'
  ): pulumi.CustomResource[] {
    const iamMembers: pulumi.CustomResource[] = [];

    // Performance warning for large numbers of rules
    if (useCase.rules.length > 50) {
      CloudInfraLogger.warn(
        `Processing ${useCase.rules.length} rules in case '${caseName}'. Consider splitting large cases for better performance.`,
        { component: 'access-matrix', operation: 'processUseCase' }
      );
    }

    useCase.rules.forEach((rule, ruleIndex) => {
      try {
        const effectivePrincipals = this.getEffectivePrincipals(
          config.principals,
          useCase.principals,
          rule.principals
        );

        if (effectivePrincipals.length === 0) {
          if (accessMatrixConfig.enableDetailedLogging) {
            CloudInfraLogger.info(
              `No principals for rule ${ruleIndex} in case '${caseName}', skipping`,
              { component: 'access-matrix', operation: 'processRule' }
            );
          }
          return;
        }

        // Performance warning for large numbers of principals
        if (
          effectivePrincipals.length > accessMatrixConfig.maxPrincipalsThreshold
        ) {
          CloudInfraLogger.warn(
            `Rule ${ruleIndex} in case '${caseName}' has ${effectivePrincipals.length} principals. This may impact performance.`,
            { component: 'access-matrix', operation: 'processRule' }
          );
        }

        const context: PolicyRuleProcessingContext = {
          caseName,
          ruleIndex,
          principalIndex: 0,
          configPrincipals: config.principals,
        };

        const ruleIamMembers = this.processPolicyRule(
          rule,
          effectivePrincipals,
          context
        );
        iamMembers.push(...ruleIamMembers);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        CloudInfraLogger.error(
          `Failed to process rule ${ruleIndex} in case '${caseName}': ${errorMessage}`,
          { component: 'access-matrix', operation: 'processRule' }
        );
        // Re-throw to maintain existing error behavior while adding context
        throw new Error(
          `Failed to process access matrix rule ${ruleIndex} in case '${caseName}': ${errorMessage}`
        );
      }
    });

    return iamMembers;
  }

  /**
   * Process a single policy rule with its principals.
   *
   * @param rule - The policy rule to process
   * @param principals - Effective principals for this rule
   * @param context - Processing context for naming and debugging
   * @returns Array of created IAM member resources
   */
  private processPolicyRule(
    rule: MatrixPolicyRule,
    principals: unknown[],
    context: PolicyRuleProcessingContext
  ): pulumi.CustomResource[] {
    const iamMembers: pulumi.CustomResource[] = [];

    principals.forEach((principal, principalIndex) => {
      const updatedContext = {
        ...context,
        principalIndex,
      };

      const resolvedPrincipal = PrincipalFactory.resolvePrincipal(
        principal,
        principalIndex
      );

      if (this.isBulkResource(rule.resource)) {
        const bulkIamMembers = this.processBulkResourceRule(
          rule,
          resolvedPrincipal,
          updatedContext
        );
        iamMembers.push(...bulkIamMembers);
      } else {
        const iamMember = this.createIamResource(
          rule,
          resolvedPrincipal,
          updatedContext
        );
        iamMembers.push(iamMember);
      }
    });

    return iamMembers;
  }

  /**
   * Process a policy rule for bulk resources (like CloudInfraBulkAccount).
   *
   * @param rule - The policy rule
   * @param resolvedPrincipal - The resolved principal
   * @param context - Processing context
   * @returns Array of created IAM member resources
   */
  private processBulkResourceRule(
    rule: MatrixPolicyRule,
    resolvedPrincipal: ResolvedPrincipal,
    context: PolicyRuleProcessingContext
  ): pulumi.CustomResource[] {
    const iamMembers: pulumi.CustomResource[] = [];
    const accounts: Record<string, unknown> = (
      rule.resource as BulkResource
    ).getAccounts();

    Object.entries(accounts).forEach(([accountKey, accountResource]) => {
      const iamMember = this.createIamResource(
        {
          ...rule,
          resource: accountResource,
        },
        resolvedPrincipal,
        context,
        accountKey
      );
      iamMembers.push(iamMember);
    });

    return iamMembers;
  }

  /**
   * Create an IAM resource for a policy rule and principal.
   *
   * @param rule - The policy rule
   * @param resolvedPrincipal - The resolved principal
   * @param context - Processing context
   * @param resourceKey - Optional resource key for bulk resources
   * @returns Created IAM member resource
   */
  private createIamResource(
    rule: MatrixPolicyRule,
    resolvedPrincipal: ResolvedPrincipal,
    context: PolicyRuleProcessingContext,
    resourceKey?: string
  ): pulumi.CustomResource {
    const resourceType = ResourceRegistry.getHandler(
      rule.resource
    ).supportedType;
    const normalizedRole = this.normalizeRole(rule.role);
    const resourceName = this.generateResourceName(
      rule,
      resolvedPrincipal,
      context,
      resourceKey
    );

    return IamBuilderRegistry.createIamBinding(resourceType, {
      resource: rule.resource,
      role: normalizedRole,
      member: resolvedPrincipal.member,
      resourceName,
    });
  }

  /**
   * Generate a unique resource name for the IAM resource.
   *
   * @param rule - The policy rule
   * @param resolvedPrincipal - The resolved principal
   * @param context - Processing context
   * @param resourceKey - Optional resource key for bulk resources
   * @returns Generated resource name
   */
  private generateResourceName(
    rule: MatrixPolicyRule,
    resolvedPrincipal: ResolvedPrincipal,
    context: PolicyRuleProcessingContext,
    resourceKey?: string
  ): string {
    const componentName =
      resourceKey || ResourceRegistry.getResourceName(rule.resource);
    const safeRole = this.getSafeRoleName(
      rule.role,
      rule.label,
      context.ruleIndex
    );
    const principalIdentifier =
      resolvedPrincipal.identifier || `principal-${context.principalIndex}`;

    const resourceName = `${componentName}:${safeRole}:${principalIdentifier}`;

    // Truncate to avoid Pulumi resource name limits using configurable max length
    if (resourceName.length > accessMatrixConfig.maxResourceNameLength) {
      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.warn(
          `Truncating resource name from ${resourceName.length} to ${accessMatrixConfig.maxResourceNameLength} characters: ${resourceName}`,
          { component: 'access-matrix', operation: 'generateResourceName' }
        );
      }
      return resourceName.substring(
        0,
        accessMatrixConfig.maxResourceNameLength
      );
    }

    return resourceName;
  }

  /**
   * Get a safe role name for resource naming.
   *
   * @param role - The role input
   * @param label - Optional label override
   * @param ruleIndex - Rule index for fallback
   * @returns Safe role name for resource naming
   */
  private getSafeRoleName(
    role: MatrixRoleInput,
    label: string | undefined,
    ruleIndex: number
  ): string {
    if (label && typeof label === 'string') {
      return label;
    }

    if (typeof role === 'string') {
      return role.replace(/^.*roles\//, '');
    }

    if (role instanceof CloudInfraRole) {
      try {
        return role.getMeta().getName();
      } catch {
        // Fallback if getName fails
      }
    }

    return `role-${ruleIndex}`;
  }

  /**
   * Normalize role input to string.
   *
   * @param role - The role input
   * @returns Normalized role string
   */
  private normalizeRole(role: MatrixRoleInput): pulumi.Input<string> {
    if (role instanceof CloudInfraRole) {
      return role.getName();
    }

    if (typeof role === 'string') {
      return role.trim();
    }

    return role;
  }

  /**
   * Get effective principals by combining config, case-level, and rule-level principals.
   *
   * @param configPrincipals - Principals from Pulumi configuration
   * @param casePrincipals - Case-level principals
   * @param rulePrincipals - Rule-level principals
   * @returns Combined and deduplicated principals
   */
  private getEffectivePrincipals(
    configPrincipals: unknown[],
    casePrincipals: AllPrincipalTypes | AllPrincipalTypes[] | undefined,
    rulePrincipals: AllPrincipalTypes | AllPrincipalTypes[] | undefined
  ): unknown[] {
    const expandedCase = PrincipalFactory.expandPrincipals(
      casePrincipals || []
    );
    const expandedRule = PrincipalFactory.expandPrincipals(
      rulePrincipals || []
    );
    const allPrincipals = [
      ...configPrincipals,
      ...expandedCase,
      ...expandedRule,
    ];

    return PrincipalFactory.deduplicate(allPrincipals);
  }

  /**
   * Check if a resource is a bulk resource (has getAccounts method).
   *
   * @param resource - The resource to check
   * @returns True if the resource is a bulk resource
   */
  private isBulkResource(resource: MatrixResource): resource is BulkResource {
    return hasMethod(resource, 'getAccounts');
  }
}
