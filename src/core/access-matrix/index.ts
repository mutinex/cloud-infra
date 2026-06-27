import { CloudInfraAccessMatrix } from './core/access-matrix';
import { initializeIamBuilders, isInitialized } from './registry-initializer';
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
