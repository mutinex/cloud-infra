import * as pulumi from '@pulumi/pulumi';
import {
  AccessMatrixCases,
  MatrixUseCaseInput,
  MatrixUseCase,
} from '../types/matrix-types';
import { ConfigResolver } from './config-resolver';
import { PolicyRuleProcessor } from './policy-rule-processor';
import { CloudInfraLogger } from '../../logging';
import { accessMatrixConfig } from '../../../config';

/**
 * @public
 * Main access matrix class that processes IAM policy rules for GCP resources.
 *
 * This class orchestrates the process of reading access control cases,
 * resolving configurations from Pulumi stack settings, and creating the
 * corresponding IAM policy resources in GCP.
 *
 * It supports a flexible configuration format, allowing principals to be
 * defined globally in the Pulumi config, per use case, or per individual
 * policy rule. It is designed to be extensible with custom resource types
 * and principal resolution logic.
 *
 * Supports both legacy array format and new use case format with case-level principals.
 */
export class CloudInfraAccessMatrix {
  private readonly configResolver: ConfigResolver;
  private readonly policyRuleProcessor: PolicyRuleProcessor;
  private readonly iamMembers: pulumi.CustomResource[] = [];

  /**
   * Create a new access matrix instance.
   *
   * @param cases - Access matrix cases mapping case names to case objects.
   *              The keys are case names, and values are `MatrixUseCase` objects.
   */
  constructor(cases: AccessMatrixCases) {
    const startTime = Date.now();

    // Validate input
    if (!cases || typeof cases !== 'object') {
      throw new Error('Access matrix cases must be a non-null object');
    }

    const caseCount = Object.keys(cases).length;
    if (caseCount === 0) {
      CloudInfraLogger.warn(
        'No cases provided. No IAM resources will be created.',
        { component: 'access-matrix', operation: 'initialization' }
      );
    }

    if (accessMatrixConfig.enableDetailedLogging) {
      CloudInfraLogger.info(`Initializing with ${caseCount} cases`, {
        component: 'access-matrix',
        operation: 'initialization',
      });
    }

    this.configResolver = new ConfigResolver();
    this.policyRuleProcessor = new PolicyRuleProcessor();

    try {
      this.processCases(cases);

      const processingTime = Date.now() - startTime;
      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Completed initialization in ${processingTime}ms. Created ${this.iamMembers.length} IAM resources.`,
          { component: 'access-matrix', operation: 'initialization' }
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      CloudInfraLogger.error(`Failed to initialize: ${errorMessage}`, {
        component: 'access-matrix',
        operation: 'initialization',
      });
      throw error;
    }
  }

  /**
   * Process all access matrix cases.
   *
   * @param cases - The access matrix cases to process
   */
  private processCases(cases: AccessMatrixCases): void {
    const caseEntries = Object.entries(cases);

    // Process cases sequentially to maintain predictable resource ordering
    caseEntries.forEach(([caseName, useCaseInput], index) => {
      if (!caseName || typeof caseName !== 'string') {
        CloudInfraLogger.warn(`Skipping invalid case name at index ${index}`, {
          component: 'access-matrix',
          operation: 'case-processing',
        });
        return;
      }

      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Processing case '${caseName}' (${index + 1}/${caseEntries.length})`,
          { component: 'access-matrix', operation: 'case-processing' }
        );
      }

      this.processCase(caseName, useCaseInput);
    });
  }

  /**
   * Process a single access matrix case.
   *
   * @param caseName - Name of the case
   * @param useCaseInput - Use case input (array of policy rules or use case object)
   */
  private processCase(
    caseName: string,
    useCaseInput: MatrixUseCaseInput
  ): void {
    const caseStartTime = Date.now();

    try {
      const config = this.configResolver.resolveConfig(caseName);

      // Normalize use case input to standard format
      const useCase = this.normalizeUseCase(useCaseInput);

      // Validate normalized use case
      if (!useCase.rules || !Array.isArray(useCase.rules)) {
        throw new Error(
          `Invalid use case structure for '${caseName}': rules must be an array`
        );
      }

      if (useCase.rules.length === 0) {
        if (accessMatrixConfig.enableDetailedLogging) {
          CloudInfraLogger.info(`Case '${caseName}' has no rules, skipping`, {
            component: 'access-matrix',
            operation: 'case-processing',
          });
        }
        return;
      }

      const processedRules = this.policyRuleProcessor.processUseCase(
        useCase,
        config,
        caseName
      );

      this.iamMembers.push(...processedRules);

      const caseProcessingTime = Date.now() - caseStartTime;
      CloudInfraLogger.info(
        accessMatrixConfig.enableDetailedLogging
          ? `processed case '${caseName}' with ${processedRules.length} IAM policy rules in ${caseProcessingTime}ms`
          : `processed case '${caseName}' with ${processedRules.length} IAM policy rules`,
        { component: 'access-matrix', operation: 'case-processing' }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to process case '${caseName}': ${errorMessage}`);
    }
  }

  /**
   * Normalize use case input to standard MatrixUseCase format.
   *
   * @param useCaseInput - Input that can be an array of policy rules or a use case object
   * @returns Normalized use case object
   */
  private normalizeUseCase(useCaseInput: MatrixUseCaseInput): MatrixUseCase {
    // If it's a use case object with a `rules` property, return as-is.
    if (
      useCaseInput &&
      typeof useCaseInput === 'object' &&
      !Array.isArray(useCaseInput) &&
      'rules' in useCaseInput
    ) {
      return useCaseInput;
    }

    // If it's a simple array of policy rules, wrap it in a use case object.
    if (Array.isArray(useCaseInput)) {
      return {
        rules: useCaseInput,
      };
    }

    // Fallback for invalid input to prevent crashes.
    CloudInfraLogger.warn(
      `Received an invalid value for a use case. It should be an array of rules or a use case object.`,
      { component: 'access-matrix', operation: 'case-normalization' }
    );
    return { rules: [] };
  }

  /**
   * Get all created IAM members (for debugging/testing).
   *
   * @returns Array of created IAM member resources
   */
  getIamMembers(): pulumi.CustomResource[] {
    return [...this.iamMembers];
  }

  /**
   * Get the number of created IAM policy rules.
   *
   * @returns Number of IAM policy rules created
   */
  getPolicyRuleCount(): number {
    return this.iamMembers.length;
  }

  /**
   * Get configuration information (for debugging).
   *
   * @returns Configuration information object
   */
  getConfigInfo(): {
    configuredCases: string[];
    rawConfig: Record<string, unknown[]>;
  } {
    return {
      configuredCases: this.configResolver.getConfiguredCases(),
      rawConfig: this.configResolver.getRawConfig(),
    };
  }
}
