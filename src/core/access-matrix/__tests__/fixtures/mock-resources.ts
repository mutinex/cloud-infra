import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

/**
 * Mock Pulumi resource factory functions for testing
 */

export function createMockBucket(props: {
  name: pulumi.Input<string>;
  project?: pulumi.Input<string>;
}): gcp.storage.Bucket {
  const bucket = Object.create(gcp.storage.Bucket.prototype);
  Object.assign(bucket, {
    name: props.name,
    project: props.project || 'test-project',
    __pulumiType: 'gcp:storage/bucket:Bucket',
    __name: typeof props.name === 'string' ? props.name : 'test-bucket',
  });
  return bucket;
}

export function createMockServiceAccount(props: {
  name: pulumi.Input<string>;
  email: pulumi.Input<string>;
  project?: pulumi.Input<string>;
}): gcp.serviceaccount.Account {
  const sa = Object.create(gcp.serviceaccount.Account.prototype);
  Object.assign(sa, {
    name: props.name,
    email: props.email,
    project: props.project || 'test-project',
    __pulumiType: 'gcp:serviceaccount/account:Account',
    __name: typeof props.name === 'string' ? props.name : 'test-sa',
  });
  return sa;
}

export function createMockProject(props: {
  id: pulumi.Input<string>;
  projectId: pulumi.Input<string>;
}): gcp.organizations.Project {
  const project = Object.create(gcp.organizations.Project.prototype);
  Object.assign(project, {
    id: props.id,
    projectId: props.projectId,
    __pulumiType: 'gcp:organizations/project:Project',
    __name: typeof props.id === 'string' ? props.id : 'test-project',
  });
  return project;
}

export function createMockFolder(props: {
  id: pulumi.Input<string>;
  folderId?: pulumi.Input<string>;
}): gcp.organizations.Folder {
  const folder = Object.create(gcp.organizations.Folder.prototype);
  Object.assign(folder, {
    id: props.id,
    folderId: props.folderId || props.id,
    __pulumiType: 'gcp:organizations/folder:Folder',
    __name: typeof props.id === 'string' ? props.id : 'test-folder',
  });
  return folder;
}

export function createMockCloudRunService(props: {
  name: pulumi.Input<string>;
  location: pulumi.Input<string>;
  project?: pulumi.Input<string>;
}): gcp.cloudrunv2.Service {
  const service = Object.create(gcp.cloudrunv2.Service.prototype);
  Object.assign(service, {
    name: props.name,
    location: props.location,
    project: props.project || 'test-project',
    __pulumiType: 'gcp:cloudrunv2/service:Service',
    __name: typeof props.name === 'string' ? props.name : 'test-service',
  });
  return service;
}

export function createMockSecret(props: {
  id: pulumi.Input<string>;
  secretId?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
  location?: pulumi.Input<string>;
}): gcp.secretmanager.Secret | gcp.secretmanager.RegionalSecret {
  const base = {
    id: props.id,
    secretId: props.secretId || props.id,
    project: props.project || 'test-project',
    __name: typeof props.id === 'string' ? props.id : 'test-secret',
  };

  if (props.location) {
    const regionalSecret = Object.create(
      gcp.secretmanager.RegionalSecret.prototype
    );
    Object.assign(regionalSecret, {
      ...base,
      location: props.location,
      __pulumiType: 'gcp:secretmanager/regionalSecret:RegionalSecret',
    });
    return regionalSecret;
  }

  const secret = Object.create(gcp.secretmanager.Secret.prototype);
  Object.assign(secret, {
    ...base,
    __pulumiType: 'gcp:secretmanager/secret:Secret',
  });
  return secret;
}

/**
 * Mock component resources with getter methods
 */
export function createMockBucketComponent(bucket: gcp.storage.Bucket) {
  return {
    getBucket: () => bucket,
    meta: {
      getName: () => 'bucket-component',
    },
  };
}

export function createMockServiceAccountComponent(
  sa: gcp.serviceaccount.Account
) {
  return {
    getServiceAccount: () => sa,
    meta: {
      getName: () => 'sa-component',
    },
  };
}

/**
 * Mock bulk account resource
 */
export function createMockBulkAccount(
  accounts: Record<string, gcp.serviceaccount.Account>
) {
  return {
    getAccounts: () => accounts,
    meta: {
      getName: () => 'bulk-accounts',
    },
  };
}

/**
 * Mock Pulumi outputs with hints
 */
export function createMockOutput(
  value: string,
  hint?: string
): pulumi.Output<string> {
  const output = pulumi.output(value) as pulumi.Output<string> & {
    __identifierHint?: string;
    resources?: Array<{ _name?: string; __name?: string }>;
  };

  if (hint) {
    output.__identifierHint = hint;
  }

  return output;
}

/**
 * Mock matrix principal objects
 */
export function createMockMatrixPrincipal(props: {
  stack: string;
  name: string;
  domain?: string;
  version?: string;
  resourceType?: string;
}) {
  return {
    stack: props.stack,
    name: props.name,
    domain: props.domain,
    version: props.version,
    resourceType: props.resourceType || 'account',
  };
}
