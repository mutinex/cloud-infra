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
