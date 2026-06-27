import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import { createIamBinding } from '../iam-binding';
import {
  IamBindingParams,
  ResourceNotSupportedError,
} from '../../types/common-types';
import { SUPPORTED_RESOURCE_TYPES } from '../../resources/resource-types';

// ---------------------------------------------------------------------------
// Pulumi mock
// ---------------------------------------------------------------------------
// Minimal stub — these tests drive the resource-property fallback paths inside
// the per-type builders, so no real Pulumi runtime/Outputs are needed.
vi.mock('@pulumi/pulumi', () => ({
  CustomResource: vi.fn(),
  // The dispatch chokepoint emits a CloudInfraLogger.info(...) gated on
  // accessMatrixConfig.enableDetailedLogging (true), which routes to
  // pulumi.log.info — stub it so the log path is exercised without throwing.
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// GCP mock
// ---------------------------------------------------------------------------
// Every `gcp.*IAMMember` / `gcp.*IamMember` constructor is mocked to return an
// object tagged with the Pulumi type TOKEN of the binding resource it would
// have created. The resource classes used for `instanceof` checks are stubbed
// as empty classes; the tests deliberately exercise the property-fallback path
// (plain object resources) rather than instanceof, so those stubs are never
// instantiated here.
vi.mock('@pulumi/gcp', () => {
  const iamMember = (token: string) =>
    vi.fn().mockImplementation((name, args) => ({
      __token: token,
      name,
      args,
    }));

  class Stub {}

  return {
    organizations: {
      Project: Stub,
      Folder: Stub,
    },
    folder: {
      IAMMember: iamMember('gcp:folder/iAMMember:IAMMember'),
    },
    projects: {
      IAMMember: iamMember('gcp:projects/iAMMember:IAMMember'),
    },
    serviceaccount: {
      Account: Stub,
      IAMMember: iamMember('gcp:serviceaccount/iAMMember:IAMMember'),
    },
    storage: {
      Bucket: Stub,
      BucketIAMMember: iamMember('gcp:storage/bucketIAMMember:BucketIAMMember'),
    },
    cloudrunv2: {
      Service: Stub,
      Job: Stub,
      ServiceIamMember: iamMember(
        'gcp:cloudrunv2/serviceIamMember:ServiceIamMember'
      ),
      JobIamMember: iamMember('gcp:cloudrunv2/jobIamMember:JobIamMember'),
    },
    compute: {
      Subnetwork: Stub,
      Instance: Stub,
      SubnetworkIAMMember: iamMember(
        'gcp:compute/subnetworkIAMMember:SubnetworkIAMMember'
      ),
      InstanceIAMMember: iamMember(
        'gcp:compute/instanceIAMMember:InstanceIAMMember'
      ),
    },
    secretmanager: {
      Secret: Stub,
      RegionalSecret: Stub,
      SecretIamMember: iamMember(
        'gcp:secretmanager/secretIamMember:SecretIamMember'
      ),
      RegionalSecretIamMember: iamMember(
        'gcp:secretmanager/regionalSecretIamMember:RegionalSecretIamMember'
      ),
    },
    artifactregistry: {
      Repository: Stub,
      RepositoryIamMember: iamMember(
        'gcp:artifactregistry/repositoryIamMember:RepositoryIamMember'
      ),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE = 'roles/viewer';
const MEMBER = 'user:test@example.com';

function params(
  resource: unknown,
  resourceName = 'binding'
): IamBindingParams {
  return { resource, role: ROLE, member: MEMBER, resourceName };
}

/**
 * Read the Pulumi type token off the resource returned by the mocked
 * `gcp.*IAMMember` constructor.
 */
function tokenOf(resource: unknown): string {
  return (resource as { __token: string }).__token;
}

/** Read the args object passed to the mocked `gcp.*IAMMember` constructor. */
function argsOf(resource: unknown): Record<string, unknown> {
  return (resource as { args: Record<string, unknown> }).args;
}

describe('createIamBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Dispatch: each of the 11 resourceType cases -> correct IAM member type
  // -------------------------------------------------------------------------
  describe('dispatch (correct gcp.*IAMMember type per resourceType)', () => {
    test('Project -> projects.IAMMember', () => {
      const res = createIamBinding(
        'gcp:organizations/project:Project',
        params({ projectId: 'my-project' })
      );
      expect(tokenOf(res)).toBe('gcp:projects/iAMMember:IAMMember');
      expect(gcp.projects.IAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        project: 'my-project',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Folder -> folder.IAMMember', () => {
      const res = createIamBinding(
        'gcp:organizations/folder:Folder',
        params({ id: 'folders/123' })
      );
      expect(tokenOf(res)).toBe('gcp:folder/iAMMember:IAMMember');
      expect(gcp.folder.IAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        folder: 'folders/123',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Service Account -> serviceaccount.IAMMember', () => {
      const res = createIamBinding(
        'gcp:serviceaccount/account:Account',
        params({ name: 'projects/p/serviceAccounts/sa@p.iam' })
      );
      expect(tokenOf(res)).toBe('gcp:serviceaccount/iAMMember:IAMMember');
      expect(gcp.serviceaccount.IAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        serviceAccountId: 'projects/p/serviceAccounts/sa@p.iam',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Bucket -> storage.BucketIAMMember', () => {
      const res = createIamBinding(
        'gcp:storage/bucket:Bucket',
        params({ name: 'my-bucket' })
      );
      expect(tokenOf(res)).toBe('gcp:storage/bucketIAMMember:BucketIAMMember');
      expect(gcp.storage.BucketIAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        bucket: 'my-bucket',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Cloud Run Job -> cloudrunv2.JobIamMember', () => {
      const res = createIamBinding(
        'gcp:cloudrunv2/job:Job',
        params({ name: 'my-job', location: 'us-central1', project: 'p' })
      );
      expect(tokenOf(res)).toBe('gcp:cloudrunv2/jobIamMember:JobIamMember');
      expect(gcp.cloudrunv2.JobIamMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        name: 'my-job',
        location: 'us-central1',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Cloud Run Service -> cloudrunv2.ServiceIamMember', () => {
      const res = createIamBinding(
        'gcp:cloudrunv2/service:Service',
        params({ name: 'my-svc', location: 'us-central1', project: 'p' })
      );
      expect(tokenOf(res)).toBe(
        'gcp:cloudrunv2/serviceIamMember:ServiceIamMember'
      );
      expect(gcp.cloudrunv2.ServiceIamMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        name: 'my-svc',
        location: 'us-central1',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Subnetwork -> compute.SubnetworkIAMMember', () => {
      const res = createIamBinding(
        'gcp:compute/subnetwork:Subnetwork',
        params({ name: 'my-subnet', region: 'us-central1', project: 'p' })
      );
      expect(tokenOf(res)).toBe(
        'gcp:compute/subnetworkIAMMember:SubnetworkIAMMember'
      );
      expect(gcp.compute.SubnetworkIAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        subnetwork: 'my-subnet',
        region: 'us-central1',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Compute Instance -> compute.InstanceIAMMember', () => {
      const res = createIamBinding(
        'gcp:compute/instance:Instance',
        params({ name: 'my-instance', zone: 'us-central1-a', project: 'p' })
      );
      expect(tokenOf(res)).toBe(
        'gcp:compute/instanceIAMMember:InstanceIAMMember'
      );
      expect(gcp.compute.InstanceIAMMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        instanceName: 'my-instance',
        zone: 'us-central1-a',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Secret (global) -> secretmanager.SecretIamMember', () => {
      const res = createIamBinding(
        'gcp:secretmanager/secret:Secret',
        params({ id: 'my-secret', secretId: 'my-secret' })
      );
      expect(tokenOf(res)).toBe(
        'gcp:secretmanager/secretIamMember:SecretIamMember'
      );
      expect(gcp.secretmanager.SecretIamMember).toHaveBeenCalledTimes(1);
      expect(gcp.secretmanager.RegionalSecretIamMember).not.toHaveBeenCalled();
      expect(argsOf(res)).toMatchObject({
        secretId: 'my-secret',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Regional Secret -> secretmanager.RegionalSecretIamMember', () => {
      const res = createIamBinding(
        'gcp:secretmanager/regionalSecret:RegionalSecret',
        params({
          id: 'my-secret',
          secretId: 'my-secret',
          location: 'us-central1',
          project: 'p',
          __pulumiType: 'gcp:secretmanager/regionalSecret:RegionalSecret',
        })
      );
      expect(tokenOf(res)).toBe(
        'gcp:secretmanager/regionalSecretIamMember:RegionalSecretIamMember'
      );
      expect(gcp.secretmanager.RegionalSecretIamMember).toHaveBeenCalledTimes(
        1
      );
      expect(gcp.secretmanager.SecretIamMember).not.toHaveBeenCalled();
      expect(argsOf(res)).toMatchObject({
        secretId: 'my-secret',
        location: 'us-central1',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });

    test('Repository -> artifactregistry.RepositoryIamMember', () => {
      const res = createIamBinding(
        'gcp:artifactregistry/repository:Repository',
        params({ repositoryId: 'my-repo', location: 'us-central1', project: 'p' })
      );
      expect(tokenOf(res)).toBe(
        'gcp:artifactregistry/repositoryIamMember:RepositoryIamMember'
      );
      expect(gcp.artifactregistry.RepositoryIamMember).toHaveBeenCalledTimes(1);
      expect(argsOf(res)).toMatchObject({
        repository: 'my-repo',
        location: 'us-central1',
        project: 'p',
        role: ROLE,
        member: MEMBER,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Parameter-validation throws (5)
  // -------------------------------------------------------------------------
  describe('parameter validation', () => {
    test('missing params throws', () => {
      expect(() =>
        createIamBinding(
          'gcp:storage/bucket:Bucket',
          undefined as unknown as IamBindingParams
        )
      ).toThrow('IAM binding parameters are required');
    });

    test('missing resource throws', () => {
      expect(() =>
        createIamBinding('gcp:storage/bucket:Bucket', {
          resource: undefined,
          role: ROLE,
          member: MEMBER,
          resourceName: 'binding',
        } as unknown as IamBindingParams)
      ).toThrow('Resource is required for IAM binding');
    });

    test('missing role throws', () => {
      expect(() =>
        createIamBinding('gcp:storage/bucket:Bucket', {
          resource: { name: 'b' },
          role: undefined,
          member: MEMBER,
          resourceName: 'binding',
        } as unknown as IamBindingParams)
      ).toThrow('Role is required for IAM binding');
    });

    test('missing member throws', () => {
      expect(() =>
        createIamBinding('gcp:storage/bucket:Bucket', {
          resource: { name: 'b' },
          role: ROLE,
          member: undefined,
          resourceName: 'binding',
        } as unknown as IamBindingParams)
      ).toThrow('Member is required for IAM binding');
    });

    test('missing resourceName throws', () => {
      expect(() =>
        createIamBinding('gcp:storage/bucket:Bucket', {
          resource: { name: 'b' },
          role: ROLE,
          member: MEMBER,
          resourceName: '',
        } as unknown as IamBindingParams)
      ).toThrow('Resource name is required for IAM binding');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Unsupported type -> ResourceNotSupportedError with "Available types"
  // -------------------------------------------------------------------------
  describe('unsupported resource type', () => {
    test('throws ResourceNotSupportedError with the available-types list', () => {
      let caught: unknown;
      try {
        createIamBinding('unsupported:resource:Type', params({ name: 'x' }));
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ResourceNotSupportedError);
      const message = (caught as Error).message;
      expect(message).toContain(
        "Resource type 'unsupported:resource:Type' is not supported"
      );
      expect(message).toContain('Available types:');
      // The diagnostic must list every supported type token.
      for (const token of [
        'gcp:organizations/project:Project',
        'gcp:organizations/folder:Folder',
        'gcp:serviceaccount/account:Account',
        'gcp:storage/bucket:Bucket',
        'gcp:cloudrunv2/job:Job',
        'gcp:cloudrunv2/service:Service',
        'gcp:compute/subnetwork:Subnetwork',
        'gcp:compute/instance:Instance',
        'gcp:secretmanager/secret:Secret',
        'gcp:secretmanager/regionalSecret:RegionalSecret',
        'gcp:artifactregistry/repository:Repository',
      ]) {
        expect(message).toContain(token);
      }
    });

    test('the "Available types" list matches SUPPORTED_RESOURCE_TYPES exactly (drift guard)', () => {
      let message = '';
      try {
        createIamBinding('unsupported:resource:Type', params({ name: 'x' }));
      } catch (err) {
        message = (err as Error).message;
      }
      // Guards against the dispatch table (IAM_BINDING_BUILDERS) and the
      // standalone SUPPORTED_RESOURCE_TYPES export drifting apart in content
      // or order.
      expect(message).toBe(
        `Resource type 'unsupported:resource:Type' is not supported. Available types: ${SUPPORTED_RESOURCE_TYPES.join(
          ', '
        )}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Error-context wrapping on the dispatch chokepoint
  // -------------------------------------------------------------------------
  describe('error-context wrapping', () => {
    test('emits the enableDetailedLogging-gated info log on a successful binding', () => {
      createIamBinding(
        'gcp:storage/bucket:Bucket',
        params({ name: 'my-bucket' }, 'log-binding')
      );
      expect(pulumi.log.info).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pulumi.log.info).mock.calls[0][0]).toContain(
        "Creating IAM binding 'log-binding' for resource type 'gcp:storage/bucket:Bucket'"
      );
    });

    test('a builder failure is re-thrown with resourceName + resourceType context', () => {
      // Project with no resolvable projectId -> buildProjectIamBinding throws.
      expect(() =>
        createIamBinding('gcp:organizations/project:Project', params({}, 'my-binding'))
      ).toThrow(
        "Failed to create IAM binding 'my-binding' for resource type 'gcp:organizations/project:Project': Unable to determine projectId for resource when creating IAMMember"
      );
    });
  });
});
