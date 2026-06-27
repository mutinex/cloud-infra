import { referenceConfig } from '../../config';

export const getDefaultOutputKey = () => referenceConfig.defaultOutputKey;

export const serviceAccountAliases = [
  'serviceaccount',
  'sa',
  'account',
] as const;

export const bucketAliases = ['gcs', 'bucket'] as const;
export const roleAliases = ['role'] as const;
export const orgRoleAliases = ['orgrole'] as const;
export const networkAliases = ['network'] as const;
export const subnetAliases = ['subnet'] as const;
export const connectorAliases = ['connector'] as const;
export const projectAliases = ['project'] as const;
export const tagAliases = ['tag'] as const;
export const folderAliases = ['folder'] as const;
export const entitlementAliases = ['entitlement', 'pam'] as const;
export const secretAliases = ['secret'] as const;
export const secretVersionAliases = ['secretversion'] as const;
export const certificateMapAliases = ['certmap'] as const;
export const cloudRunAliases = ['cloudrun'] as const;

function mapFrom(
  group: readonly string[],
  type: string
): Record<string, string> {
  const map: Record<string, string> = {};
  group.forEach(alias => {
    map[alias] = type;
  });
  return map;
}

export const resourceTypeMap: Record<string, string> = {
  ...mapFrom(bucketAliases, 'gcp:storage:Bucket'),
  ...mapFrom(roleAliases, 'gcp:projects:IAMCustomRole'),
  ...mapFrom(orgRoleAliases, 'gcp:organizations:IAMCustomRole'),
  ...mapFrom(serviceAccountAliases, 'gcp:serviceaccount:Account'),
  ...mapFrom(networkAliases, 'gcp:compute:Network'),
  ...mapFrom(subnetAliases, 'gcp:compute:Subnetwork'),
  ...mapFrom(connectorAliases, 'gcp:vpcaccess:Connector'),
  ...mapFrom(projectAliases, 'gcp:organizations:Project'),
  ...mapFrom(tagAliases, 'gcp:tags:TagValue'),
  ...mapFrom(folderAliases, 'gcp:organizations:Folder'),
  ...mapFrom(entitlementAliases, 'gcp:privilegedaccessmanager:Entitlement'),
  ...mapFrom(secretAliases, 'gcp:secretmanager:Secret'),
  ...mapFrom(secretVersionAliases, 'gcp:secretmanager:SecretVersion'),
  ...mapFrom(certificateMapAliases, 'gcp:certificatemanager:CertificateMap'),
  ...mapFrom(cloudRunAliases, 'gcp:cloudrunv2:Service'),
};

/**
 * The single-character separator used to compose a flat-output KEY
 * (`<domain>.<service>[.<region>].<name>.<field>`). Exported so the producer
 * (`CloudInfraOutput.getFlatOutputs`) and any consumer that recomposes the key
 * prefix (`CloudInfraReference`) share one source of truth.
 */
export const FLAT_KEY_SEPARATOR = '.';

/**
 * The canonical `<full Pulumi type token> → <short service alias>` table used
 * to build the `service` segment of a flat-output key.
 *
 * This is the FORWARD (type → alias) direction; {@link resourceTypeMap} is the
 * REVERSE (alias → type) direction the consumer reader uses to resolve a
 * `{ type }` disambiguator. Both directions are intentionally kept consistent
 * (e.g. `sa` ⇄ `gcp:serviceaccount:Account`).
 *
 * EVERY type token emitted by any component's `exportOutputs()`/`record()` MUST
 * have an EXPLICIT entry here. A coverage test
 * (`output/__tests__/alias-coverage.test.ts`) fails if any emitted type is
 * missing, so a newly added resource type cannot silently fall back to the
 * deterministic {@link deriveServiceAliasFallback}.
 */
export const serviceAliasMap: Record<string, string> = {
  // Identity / IAM
  'gcp:serviceaccount:Account': 'sa',
  'gcp:projects:IAMCustomRole': 'role',
  'gcp:organizations:IAMCustomRole': 'orgrole',
  'gcp:iam:WorkloadIdentityPool': 'wip',
  'gcp:iam:WorkloadIdentityPoolProvider': 'wipprovider',
  'gcp:privilegedaccessmanager:Entitlement': 'entitlement',
  // Org hierarchy
  'gcp:organizations:Project': 'project',
  'gcp:organizations:Folder': 'folder',
  'gcp:tags:TagKey': 'tagkey',
  'gcp:tags:TagValue': 'tag',
  // Storage / data
  'gcp:storage:Bucket': 'bucket',
  'gcp:secretmanager:Secret': 'secret',
  'gcp:secretmanager:SecretVersion': 'secretversion',
  'gcp:secretmanager:RegionalSecret': 'regionalsecret',
  'gcp:secretmanager:RegionalSecretVersion': 'regionalsecretversion',
  'gcp:artifactregistry:Repository': 'repo',
  // SQL
  'gcp:sql:DatabaseInstance': 'sqlinstance',
  'gcp:sql:Database': 'sqldb',
  'gcp:sql:User': 'sqluser',
  // Networking
  'gcp:compute:Network': 'network',
  'gcp:compute:Subnetwork': 'subnet',
  'gcp:vpcaccess:Connector': 'connector',
  'gcp:compute:Address': 'address',
  'gcp:compute:GlobalAddress': 'globaladdress',
  'gcp:compute:Route': 'route',
  'gcp:compute:Router': 'router',
  'gcp:compute:RouterNat': 'routernat',
  'gcp:servicenetworking:Connection': 'psaconnection',
  // Load balancing
  'gcp:compute:BackendService': 'backend',
  'gcp:compute:RegionBackendService': 'regionbackend',
  'gcp:compute:HealthCheck': 'healthcheck',
  'gcp:certificatemanager:CertificateMap': 'certmap',
  // Compute / serverless
  'gcp:compute:Instance': 'instance',
  'gcp:cloudrunv2:Service': 'run',
  'gcp:cloudrunv2:Job': 'job',
};

/**
 * Deterministic fallback alias for a type token that has no EXPLICIT entry in
 * {@link serviceAliasMap}: the lowercased final token of a `gcp:x/y:Z` string
 * (the segment after the last `:`). e.g. `gcp:foo:BarBaz` → `barbaz`.
 *
 * This exists so the producer never throws on an unmapped type, but the
 * alias-coverage test ensures it is NEVER reached for a type any component
 * actually emits — new types must be added to {@link serviceAliasMap} explicitly.
 */
export function deriveServiceAliasFallback(type: string): string {
  const lastColon = type.lastIndexOf(':');
  const lastToken = lastColon === -1 ? type : type.slice(lastColon + 1);
  return lastToken.toLowerCase();
}

/**
 * Resolves the short `service` segment for a flat-output key from a full Pulumi
 * type token: the explicit {@link serviceAliasMap} entry when present, else the
 * deterministic {@link deriveServiceAliasFallback}.
 */
export function getServiceAlias(type: string): string {
  return serviceAliasMap[type] ?? deriveServiceAliasFallback(type);
}
