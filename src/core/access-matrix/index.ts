import { CloudInfraAccessMatrix } from './core/access-matrix';
import { initializeIamBuilders, isInitialized } from './registry-initializer';
import { AccessMatrixCasesInput } from './types/matrix-types';

// Export the main class
export { CloudInfraAccessMatrix } from './core/access-matrix';

// Export types for external use
export type {
  MatrixPolicyRule,
  MatrixRoleInput,
  MatrixPrincipalInput,
  MatrixUseCase,
  AccessMatrixCases,
  AccessMatrixCasesInput,
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
export { PrincipalFactory } from './principals/principal-factory';

// Export configuration for external access
export { accessMatrixConfig } from '../../config';

// Export principal resolver interface for extensibility
export type { PrincipalResolver } from './principals/principal-types';

// Named principal helpers (preferred, explicit-intent constructors). These are
// sugar over the existing principal kinds and resolve to identical bindings.
export { saMember, member, ref } from './principals/helpers';
export type { RefArgs } from './principals/helpers';

// One-liner IAM grant — single-rule CloudInfraAccessMatrix with byte-identical
// resource names. The matrix engine with a smaller hat (the centralized IAM
// path; no IAM methods are added to resource components).
export { grant } from './grant';
export type { GrantOptions } from './grant';

// Initialize the system on import
if (!isInitialized()) {
  initializeIamBuilders();
}

/**
 * Create a new CloudInfraAccessMatrix instance with automatic initialization.
 * This is the main entry point for the access matrix system.
 *
 * @param cases - Access matrix cases mapping case names to use case objects.
 *              The canonical value shape is the `MatrixUseCase`
 *              `{ principals?, rules }` object; a bare `MatrixPolicyRule[]`
 *              array is still accepted per case for backward compatibility.
 * @returns New CloudInfraAccessMatrix instance
 */
export function createAccessMatrix(
  cases: AccessMatrixCasesInput
): CloudInfraAccessMatrix {
  // Ensure builders are initialized
  if (!isInitialized()) {
    initializeIamBuilders();
  }

  return new CloudInfraAccessMatrix(cases);
}
