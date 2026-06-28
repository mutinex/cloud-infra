/**
 * **`@mutinex/cloud-infra/org`** — organization-hierarchy components.
 *
 * This is the CANONICAL home for the org-tier surface: the components a
 * platform/landing-zone author composes when laying down the organization
 * hierarchy (folders, tags, projects, the org network set, PAM entitlements,
 * and Workload Identity federation). A service author who only composes
 * application resources never needs this subpath; importing from here keeps
 * the package root focused on the common application surface.
 *
 * ```ts
 * import {
 *   CloudInfraFolder,
 *   CloudInfraTag,
 *   CloudInfraHostProject,
 *   CloudInfraServiceProject,
 *   CloudInfraSubnet,
 *   CloudInfraConnector,
 *   CloudInfraPSA,
 *   CloudInfraNat,
 *   CloudInfraEntitlement,
 *   CloudInfraWIP,
 *   CloudInfraWIPProvider,
 * } from '@mutinex/cloud-infra/org';
 * ```
 *
 * Every symbol here is ALSO still exported (as `@deprecated`) from the package
 * root for backward compatibility — see `src/index.ts`. New code should import
 * the org tier from this subpath.
 *
 * @module @mutinex/cloud-infra/org
 */

// Org hierarchy: folders & tags.
export * from './organization/folder';
export * from './organization/tag';

// Org hierarchy: host/service project components (Shared VPC + API
// bootstrapping). We star only the host/service components and re-export the
// project CONFIG types explicitly — the project-bootstrap internals in
// `./organization/project/common` (DelayResource, baselineApis,
// apisNeedingIdentities, createTagBindings, createServiceIdentities, the
// ServiceIdentity* types) are `/advanced`-tier, not part of the `/org` surface.
export * from './organization/project/host';
export * from './organization/project/service';
export {
  CloudInfraProjectCustomConfigSchema,
} from './organization/project/common';
export type {
  CloudInfraProjectConfig,
  CloudInfraProjectCustomConfig,
} from './organization/project/common';

// Org network set: subnet / connector / PSA / NAT.
export * from './organization/network';

// Privileged Access Manager: entitlements.
export * from './organization/pam';

// Workload Identity federation: pool + provider.
export * from './components/wip';
