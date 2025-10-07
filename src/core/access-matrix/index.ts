import { CloudInfraAccessMatrix } from './core/access-matrix';
import { initializeIamBuilders, isInitialized } from './registry-initializer';
import { IamBuilderRegistry } from './builders/iam-builder-registry';
import { PrincipalFactory } from './principals/principal-factory';
import { accessMatrixConfig } from '../../config';
import { CloudInfraLogger } from '../logging';
import { AccessMatrixCases } from './types/matrix-types';

// Export the main class
export { CloudInfraAccessMatrix } from './core/access-matrix';

// Export types for external use
export type {
  MatrixPolicyRule,
  MatrixRoleInput,
  MatrixPrincipalInput,
  MatrixUseCase,
  AccessMatrixCases,
} from './types/matrix-types';

export type {
  ResolvedPrincipal,
  ResourceInfo,
  IamBindingParams,
} from './types/common-types';

// Export error classes
export {
  AccessMatrixError,
  ResourceNotSupportedError,
  UnsupportedPrincipalError,
  ResourceTypeDiscoveryError,
} from './types/common-types';

// Export registries for advanced usage
export { ResourceRegistry } from './resources/resource-registry';
export { IamBuilderRegistry } from './builders/iam-builder-registry';
export { PrincipalFactory } from './principals/principal-factory';

// Export configuration for external access
export { accessMatrixConfig } from '../../config';

// Export builder interfaces for extensibility
export type { IamBuilder } from './builders/iam-builder-registry';
export type { PrincipalResolver } from './principals/principal-types';

// Initialize the system on import
if (!isInitialized()) {
  initializeIamBuilders();
}

/**
 * Create a new CloudInfraAccessMatrix instance with automatic initialization.
 * This is the main entry point for the access matrix system.
 *
 * @param cases - Access matrix cases mapping case names to policy rules or use case objects.
 * @returns New CloudInfraAccessMatrix instance
 */
export function createAccessMatrix(
  cases: AccessMatrixCases
): CloudInfraAccessMatrix {
  // Ensure builders are initialized
  if (!isInitialized()) {
    initializeIamBuilders();
  }

  return new CloudInfraAccessMatrix(cases);
}

/**
 * Get information about the current access matrix configuration.
 *
 * @returns Configuration information including supported types
 */
export function getAccessMatrixInfo(): {
  initialized: boolean;
  supportedResourceTypes: string[];
  supportedPrincipalTypes: string[];
  configuration: typeof accessMatrixConfig;
  cacheStats: {
    builderCacheSize: number;
    principalCacheEnabled: boolean;
  };
} {
  // Ensure initialization
  if (!isInitialized()) {
    initializeIamBuilders();
  }

  return {
    initialized: isInitialized(),
    supportedResourceTypes: IamBuilderRegistry.getRegisteredTypes(),
    supportedPrincipalTypes: PrincipalFactory.getRegisteredTypes(),
    configuration: accessMatrixConfig,
    cacheStats: {
      builderCacheSize: IamBuilderRegistry.getRegisteredTypes().length,
      principalCacheEnabled: true, // Principal caching is now always enabled
    },
  };
}

/**
 * Clear all caches in the access matrix system.
 * Useful for memory management in long-running applications.
 */
export function clearAccessMatrixCaches(): void {
  IamBuilderRegistry.clearCache();
  PrincipalFactory.clearCache();

  if (accessMatrixConfig.enableDetailedLogging) {
    CloudInfraLogger.info('All caches cleared', {
      component: 'access-matrix',
      operation: 'clearAccessMatrixCaches',
    });
  }
}

/**
 * Validate access matrix configuration and cases.
 *
 * @param cases - Access matrix cases to validate
 * @returns Validation result with any issues found
 */
export function validateAccessMatrixCases(cases: Record<string, unknown>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cases || typeof cases !== 'object') {
    errors.push('Cases must be a non-null object');
    return { isValid: false, errors, warnings };
  }

  const caseNames = Object.keys(cases);

  if (caseNames.length === 0) {
    warnings.push('No cases provided - no IAM resources will be created');
  }

  // Check for potential performance issues
  if (caseNames.length > 20) {
    warnings.push(
      `Large number of cases (${caseNames.length}) may impact performance`
    );
  }

  // Validate each case
  for (const [caseName, caseValue] of Object.entries(cases)) {
    if (!caseName || typeof caseName !== 'string') {
      errors.push('Case names must be non-empty strings');
      continue;
    }

    if (!caseValue) {
      errors.push(`Case '${caseName}' cannot be null or undefined`);
      continue;
    }

    // Check if it's an array or use case object
    if (Array.isArray(caseValue)) {
      if (caseValue.length === 0) {
        warnings.push(`Case '${caseName}' has no rules`);
      } else if (caseValue.length > 50) {
        warnings.push(
          `Case '${caseName}' has many rules (${caseValue.length}) which may impact performance`
        );
      }
    } else if (typeof caseValue === 'object') {
      const useCaseObject = caseValue as Record<string, unknown>;
      if (!useCaseObject.rules || !Array.isArray(useCaseObject.rules)) {
        errors.push(`Case '${caseName}' must have a 'rules' array property`);
      } else if (useCaseObject.rules.length === 0) {
        warnings.push(`Case '${caseName}' has no rules`);
      }
    } else {
      errors.push(
        `Case '${caseName}' must be an array of rules or a use case object`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
