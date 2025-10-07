/**
 * Reference management module for cross-stack resource access.
 *
 * This module provides utilities for referencing resources from other Pulumi stacks
 * with proper type mapping, domain organization, and property access methods.
 */

// Export the main classes
export { CloudInfraReference } from './reference-manager';
export { ReferenceWithoutDomain } from './reference-without-domain';

// Export configuration and types
export {
  getDefaultOutputKey as defaultOutputKey,
  serviceAccountAliases,
  bucketAliases,
  roleAliases,
  orgRoleAliases,
  networkAliases,
  subnetAliases,
  connectorAliases,
  projectAliases,
  cloudRunAliases,
  tagAliases,
  folderAliases,
  resourceTypeMap,
} from './config';

export type {
  ReferenceDomain,
  ReferenceWithDomainConfig,
  ReferenceWithoutDomainConfig,
  StackOutputs,
  ResourceOutput,
} from './types';
