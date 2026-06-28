/**
 * **`@mutinex/cloud-infra/advanced`** — power-user / internal extension surface.
 *
 * This is the CANONICAL home for the low-level building blocks that most
 * service authors never touch: access-matrix internals, naming-engine
 * internals, the shared `core/helpers` utilities, the abstract component base,
 * per-component factory/base/Pulumi-config types, and the redundant
 * `CloudInfra<X>Component` class aliases.
 *
 * These are exposed for advanced composition (building custom components,
 * extending the access matrix, driving the naming engine directly) and for
 * tooling. They are intentionally kept OUT of the package-root lead surface so
 * the discoverable API stays the ~10 component classes plus the four core
 * objects.
 *
 * ```ts
 * import {
 *   ResourceRegistry,
 *   PrincipalFactory,
 *   resolveMeta,
 *   getRegionCode,
 *   hash7,
 * } from '@mutinex/cloud-infra/advanced';
 * ```
 *
 * Every symbol here is ALSO still exported (as `@deprecated`) from the package
 * root for backward compatibility — see `src/index.ts`. New code should import
 * the advanced tier from this subpath.
 *
 * @module @mutinex/cloud-infra/advanced
 */

/* -------------------------------------------------------------------------- */
/* Access-matrix internals                                                    */
/* -------------------------------------------------------------------------- */

export { ResourceRegistry } from './core/access-matrix/resources/resource-registry';
export { PrincipalFactory } from './core/access-matrix/principals/principal-factory';
export type { PrincipalResolver } from './core/access-matrix/principals/principal-types';
export {
  SUPPORTED_RESOURCE_TYPES,
  type SupportedResourceType,
} from './core/access-matrix/resources/resource-types';
export {
  MatrixPrincipalSchema,
  MatrixPrincipalObjectSchema,
} from './core/access-matrix/types/matrix-types';
export type {
  MatrixPolicyRule,
  MatrixRoleInput,
  MatrixPrincipalInput,
  MatrixUseCase,
  AccessMatrixCases,
  AccessMatrixCasesInput,
} from './core/access-matrix/types/matrix-types';
export type {
  ResolvedPrincipal,
  ResourceInfo,
  IamBindingParams,
} from './core/access-matrix/types/common-types';
export {
  AccessMatrixError,
  ResourceNotSupportedError,
  UnsupportedPrincipalError,
  ResourceTypeDiscoveryError,
} from './core/access-matrix/types/common-types';
export { grant } from './core/access-matrix/grant';
export type { GrantOptions } from './core/access-matrix/grant';
export { saMember, member, ref } from './core/access-matrix/principals/helpers';
export type { RefArgs } from './core/access-matrix/principals/helpers';

/* -------------------------------------------------------------------------- */
/* Naming-engine internals                                                    */
/* -------------------------------------------------------------------------- */

// Name-first resolution bridge + the meta/config split helper.
export { resolveMeta, splitMetaArgs } from './core/component/naming';
export type { MetaArgsSplit } from './core/component/naming';

// Raw zod schemas + meta input type.
export {
  CloudInfraMetaSchema,
  gcpGenericNameSchema,
  gcpServiceAccountNameSchema,
} from './core/meta/schemas';

// Region / dual-region helpers + the Gcp* constant tables.
export {
  getRegionCode,
  getDualRegionLocation,
  hash7,
  GcpRegions,
  GcpMultiRegions,
  GcpDualRegions,
  GcpDualRegionLocations,
  GcpPredefinedDualRegions,
  GcpDualRegionToLocation,
  prefixLengthLimit,
} from './core/meta/locations';

/* -------------------------------------------------------------------------- */
/* core/helpers utilities                                                     */
/* -------------------------------------------------------------------------- */

export {
  withDefaults,
  deriveRegion,
  networkSelfLink,
  assertSingleRegion,
  omit,
  hasMethod,
  hasProperty,
} from './core/helpers';

/* -------------------------------------------------------------------------- */
/* Abstract component base                                                    */
/* -------------------------------------------------------------------------- */

export {
  CloudInfraComponent,
  type CloudInfraComponentLabels,
  type CloudInfraComponentBaseArgs,
} from './core/component/base';

/* -------------------------------------------------------------------------- */
/* Per-component base / factory / Pulumi-config leakage                       */
/* -------------------------------------------------------------------------- */

export {
  CloudInfraAccountBase,
  createGcpServiceAccount,
} from './components/account/common';
export type {
  CloudInfraAccountPulumiConfig,
  CreateCloudInfraAccountParams,
  ICloudInfraAccountMembership,
} from './components/account/common';
export type { CloudInfraAccountIamMemberIdentity } from './components/account/single';

export {
  DelayResource,
  baselineApis,
  apisNeedingIdentities,
  createTagBindings,
  createServiceIdentities,
} from './organization/project/common';
export type {
  ServiceIdentityConfig,
  ServiceIdentityResult,
} from './organization/project/common';

/* -------------------------------------------------------------------------- */
/* Redundant CloudInfra<X>Component class aliases                             */
/* -------------------------------------------------------------------------- */

export { CloudInfraAlbComponent } from './components/alb';
export { CloudInfraBackendServiceComponent } from './components/backendservice';
export { CloudInfraCloudRunJobComponent } from './components/cloudrunjob';
export { CloudInfraCloudRunServiceComponent } from './components/cloudrunservice';
export { CloudInfraComputeInstanceComponent } from './components/instance';
export {
  CloudInfraDatabaseComponent,
} from './components/database/database';
export { CloudInfraDatabaseInstanceComponent } from './components/database/instance';
export { CloudInfraDatabaseUserComponent } from './components/database/user';
export { CloudInfraSecretVersionComponent } from './components/secret';
export {
  CloudInfraWIPComponent,
  CloudInfraWIPProviderComponent,
} from './components/wip';
