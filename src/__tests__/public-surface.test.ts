/**
 * Wave 2.1 — public-surface back-compat guard.
 *
 * The Wave 2 "surface shrink" introduces the tiered subpath entry points
 * `@mutinex/cloud-infra/org` and `@mutinex/cloud-infra/advanced` and moves the
 * CANONICAL home of the org / advanced tiers onto them. The HARD constraint is
 * full backward compatibility: every symbol importable from the package ROOT
 * today must KEEP resolving from the root (via `@deprecated` re-exports).
 *
 * This file pins that contract three ways:
 *
 *  1. **Root back-compat (runtime values).** Every value export that the
 *     pre-Wave-2 root barrel emitted is asserted present on the root namespace.
 *     The list below is the FROZEN legacy runtime surface (135 value exports,
 *     extracted from the v2-baseline `dist/index.js`). A symbol silently
 *     dropping out of the root barrel fails here. (Type-only exports cannot be
 *     observed at runtime; they are guarded at compile time by §2.)
 *
 *  2. **Root back-compat (types).** A representative set of legacy TYPE exports
 *     is imported from the root; if any stopped resolving from the root this
 *     file would fail `tsc --noEmit` (run in CI alongside the suite).
 *
 *  3. **Subpath tiers.** The `/org` and `/advanced` barrels export their tier's
 *     headline symbols.
 *
 * Adding NEW exports to the root is fine (additive); this guard only fails on a
 * REGRESSION (a legacy symbol that stops resolving from the root).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Importing the root barrel eagerly evaluates a couple of `gcpConfig` reads
// (e.g. a zod `.default(gcpConfig.billingAccountId)` in organization/project),
// so the required Pulumi config must be present BEFORE the barrels load. ESM
// `import` is hoisted, so the runtime namespaces are loaded via dynamic
// `import()` inside `beforeAll`, after the config is set. (The `import type`
// below is erased at runtime and only feeds the §2 compile-time guard.)
pulumi.runtime.setConfig('gcp:project', 'test-project');
pulumi.runtime.setConfig('cloudInfra:organizationId', '111111111111');
pulumi.runtime.setConfig('cloudInfra:billingAccountId', 'XXXXXX-XXXXXX-XXXXXX');
pulumi.runtime.setConfig('cloudInfra:organizationName', 'test-org');
pulumi.runtime.setConfig('cloudInfra:defaultOutputKey', 'test-key');

let root: Record<string, unknown>;
let org: Record<string, unknown>;
let advanced: Record<string, unknown>;

beforeAll(async () => {
  root = (await import('../index')) as Record<string, unknown>;
  org = (await import('../org')) as Record<string, unknown>;
  advanced = (await import('../advanced')) as Record<string, unknown>;
});

// Compile-time guard (§2): legacy TYPE exports must still resolve from the root.
import type {
  CloudInfraFolderArgs,
  CloudInfraTagConfig,
  CloudInfraEntitlementConfig,
  CloudInfraServiceProjectArgs,
  CloudInfraSubnetConfig,
  CloudInfraWIPProviderConfig,
  CloudInfraAccountArgs,
  CloudInfraBucketConfig,
  CloudInfraRoleConfig,
  Domain,
  GcpRegion,
  OutputResource,
  ReferenceDomain,
  ResolvedPrincipal,
  GrantOptions,
  RefArgs,
  MatrixUseCase,
  CreateCloudInfraAccountParams,
  ServiceIdentityConfig,
} from '../index';

/**
 * FROZEN legacy ROOT runtime value-export surface (pre-Wave-2 `dist/index.js`).
 * Do NOT remove an entry without a major-version break — every entry is a
 * symbol some consumer may `import { X } from '@mutinex/cloud-infra'`.
 */
const LEGACY_ROOT_VALUE_EXPORTS = [
  'ACCOUNT_TYPE',
  'AccessMatrixError',
  'BACKEND_SERVICE_TYPE',
  'BUCKET_TYPE',
  'BULK_ACCOUNT_TYPE',
  'BULK_BUCKET_TYPE',
  'CERTIFICATE_MAP_TYPE',
  'CLOUD_INFRA_ALB_TYPE',
  'CLOUD_INFRA_HOST_PROJECT_TYPE',
  'CLOUD_INFRA_SERVICE_PROJECT_TYPE',
  'CLOUD_RUN_JOB_TYPE',
  'CLOUD_RUN_SERVICE_TYPE',
  'COMPUTE_INSTANCE_TYPE',
  'CONNECTOR_TYPE',
  'CloudInfraAccessMatrix',
  'CloudInfraAccount',
  'CloudInfraAccountBase',
  'CloudInfraAlb',
  'CloudInfraAlbComponent',
  'CloudInfraAlbConfigSchema',
  'CloudInfraBackendService',
  'CloudInfraBackendServiceComponent',
  'CloudInfraBackendServiceExtrasSchema',
  'CloudInfraBucket',
  'CloudInfraBulkAccount',
  'CloudInfraBulkBucket',
  'CloudInfraCertificateMap',
  'CloudInfraCloudRunJob',
  'CloudInfraCloudRunJobComponent',
  'CloudInfraCloudRunService',
  'CloudInfraCloudRunServiceComponent',
  'CloudInfraComputeInstance',
  'CloudInfraComputeInstanceComponent',
  'CloudInfraConnector',
  'CloudInfraConnectorConfigSchema',
  'CloudInfraDatabase',
  'CloudInfraDatabaseComponent',
  'CloudInfraDatabaseInstance',
  'CloudInfraDatabaseInstanceComponent',
  'CloudInfraDatabaseUser',
  'CloudInfraDatabaseUserComponent',
  'CloudInfraEntitlement',
  'CloudInfraEntitlementExtrasSchema',
  'CloudInfraFolder',
  'CloudInfraFolderExtrasSchema',
  'CloudInfraHostProject',
  'CloudInfraMeta',
  'CloudInfraMetaSchema',
  'CloudInfraNat',
  'CloudInfraNatConfigSchema',
  'CloudInfraOutput',
  'CloudInfraPSA',
  'CloudInfraPSAConfigSchema',
  'CloudInfraProjectCustomConfigSchema',
  'CloudInfraReference',
  'CloudInfraRepository',
  'CloudInfraRole',
  'CloudInfraSecretVersion',
  'CloudInfraSecretVersionComponent',
  'CloudInfraServiceProject',
  'CloudInfraSubnet',
  'CloudInfraTag',
  'CloudInfraWIP',
  'CloudInfraWIPComponent',
  'CloudInfraWIPProvider',
  'CloudInfraWIPProviderComponent',
  'DATABASE_INSTANCE_TYPE',
  'DATABASE_TYPE',
  'DATABASE_USER_TYPE',
  'DelayResource',
  'Domains',
  'ENTITLEMENT_TYPE',
  'Entitlement',
  'FOLDER_TYPE',
  'GcpDualRegionLocations',
  'GcpDualRegionToLocation',
  'GcpDualRegions',
  'GcpMultiRegions',
  'GcpPredefinedDualRegions',
  'NAT_TYPE',
  'PSA_TYPE',
  'PrincipalFactory',
  'REPOSITORY_TYPE',
  'ROLE_TYPE',
  'ReferenceWithoutDomain',
  'ResourceNotSupportedError',
  'ResourceRegistry',
  'ResourceTypeDiscoveryError',
  'SECRET_VERSION_TYPE',
  'SUBNET_TYPE',
  'TAG_TYPE',
  'TagConfigSchema',
  'UnsupportedPrincipalError',
  'WIP_PROVIDER_TYPE',
  'WIP_TYPE',
  'accessMatrixConfig',
  'apisNeedingIdentities',
  'assertSingleRegion',
  'baselineApis',
  'bucketAliases',
  'cloudRunAliases',
  'connectorAliases',
  'createAccessMatrix',
  'createGcpServiceAccount',
  'createServiceIdentities',
  'createTagBindings',
  'defaultOutputKey',
  'deriveRegion',
  'folderAliases',
  'gcpConfig',
  'gcpGenericNameSchema',
  'gcpServiceAccountNameSchema',
  'getDualRegionLocation',
  'getRegionCode',
  'grant',
  'hasMethod',
  'hasProperty',
  'hash7',
  'member',
  'networkAliases',
  'networkSelfLink',
  'omit',
  'orgRoleAliases',
  'prefixLengthLimit',
  'projectAliases',
  'ref',
  'referenceConfig',
  'resourceNamingConfig',
  'resourceTypeMap',
  'roleAliases',
  'saMember',
  'serviceAccountAliases',
  'subnetAliases',
  'tagAliases',
  'withDefaults',
] as const;

describe('public surface — root back-compat (§1 runtime values)', () => {
  it('still exports all 135 legacy root value exports', () => {
    const rootKeys = new Set(Object.keys(root));
    const missing = LEGACY_ROOT_VALUE_EXPORTS.filter((n) => !rootKeys.has(n));
    expect(missing).toEqual([]);
  });

  it.each(LEGACY_ROOT_VALUE_EXPORTS)('root re-exports %s', (sym) => {
    expect(root[sym]).toBeDefined();
  });
});

describe('public surface — root back-compat (§2 type exports compile-guard)', () => {
  it('legacy type exports still resolve from the root (enforced by tsc)', () => {
    // The imports at the top of this file are the assertion; this body just
    // references one so the binding is "used".
    const _t: Domain | undefined = undefined;
    type _Used =
      | CloudInfraFolderArgs
      | CloudInfraTagConfig
      | CloudInfraEntitlementConfig
      | CloudInfraServiceProjectArgs
      | CloudInfraSubnetConfig
      | CloudInfraWIPProviderConfig
      | CloudInfraAccountArgs
      | CloudInfraBucketConfig
      | CloudInfraRoleConfig
      | GcpRegion
      | OutputResource
      | ReferenceDomain
      | ResolvedPrincipal
      | GrantOptions
      | RefArgs
      | MatrixUseCase
      | CreateCloudInfraAccountParams
      | ServiceIdentityConfig;
    expect(_t).toBeUndefined();
  });
});

describe('public surface — /org subpath exports the org tier (§3)', () => {
  const ORG_TIER = [
    'CloudInfraFolder',
    'CloudInfraTag',
    'CloudInfraHostProject',
    'CloudInfraServiceProject',
    'CloudInfraSubnet',
    'CloudInfraConnector',
    'CloudInfraPSA',
    'CloudInfraNat',
    'CloudInfraEntitlement',
    'CloudInfraWIP',
    'CloudInfraWIPProvider',
  ] as const;

  it.each(ORG_TIER)('/org exports %s', (sym) => {
    expect(org[sym]).toBeDefined();
  });
});

describe('public surface — /advanced subpath exports the advanced tier (§3)', () => {
  const ADVANCED_TIER = [
    'ResourceRegistry',
    'PrincipalFactory',
    'grant',
    'saMember',
    'member',
    'ref',
    'resolveMeta',
    'splitMetaArgs',
    'CloudInfraComponent',
    'getRegionCode',
    'getDualRegionLocation',
    'hash7',
    'GcpRegions',
    'SUPPORTED_RESOURCE_TYPES',
    'CloudInfraMetaSchema',
    'withDefaults',
    'deriveRegion',
    'CloudInfraAccountBase',
    'createGcpServiceAccount',
    'CloudInfraAlbComponent',
  ] as const;

  it.each(ADVANCED_TIER)('/advanced exports %s', (sym) => {
    expect(advanced[sym]).toBeDefined();
  });
});
