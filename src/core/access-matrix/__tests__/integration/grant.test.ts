import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

import { CloudInfraAccessMatrix } from '../..';
import { grant } from '../../grant';
import { ResourceRegistry } from '../../resources/resource-registry';
import { PrincipalFactory } from '../../principals/principal-factory';
import { TestResourceFactory } from '../fixtures/test-builders';

/**
 * `grant(to, role, on, opts?)` must emit BYTE-IDENTICAL IAM resource names (and
 * member strings / type tokens) to the equivalent single-rule matrix case.
 * These tests build both paths against the same mocked GCP constructors and
 * compare the captured logical resource names.
 */

// Mirror the mock surface used by essential.test.ts so the access matrix can
// run and the IAM constructors capture their logical `name` (first arg).
vi.mock('@pulumi/pulumi', () => ({
  Config: vi.fn(() => ({
    getObject: vi.fn().mockReturnValue({}),
    require: vi.fn((key: string) => `mock-${key}`),
  })),
  CustomResource: vi.fn(),
  ComponentResource: class {
    constructor() {}
    registerOutputs() {}
  },
  rootStackResource: undefined,
  output: vi.fn(value => ({
    apply: vi.fn(fn => fn(value)),
    __isOutput: true,
    isSecret: false,
  })),
  Output: {
    isInstance: vi.fn((obj: any) => obj && obj.__isOutput === true),
  },
  interpolate: vi.fn((template: TemplateStringsArray, ...args: unknown[]) => {
    const templateStr = Array.isArray(template)
      ? template.join('')
      : String(template);
    return templateStr + args.join('');
  }),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@pulumi/gcp', () => {
  class MockBucket {
    name: pulumi.Input<string>;
    __pulumiType: string;
    __name: string;
    constructor(name: string, args?: { name?: pulumi.Input<string> }) {
      this.name = args?.name || name;
      this.__pulumiType = 'gcp:storage/bucket:Bucket';
      this.__name = name;
    }
  }
  class MockServiceAccount {
    name: pulumi.Input<string>;
    email: pulumi.Input<string>;
    __pulumiType: string;
    __name: string;
    constructor(
      name: string,
      args?: { name?: pulumi.Input<string>; email?: pulumi.Input<string> }
    ) {
      this.name = args?.name || name;
      this.email = args?.email || `${name}@test.iam.gserviceaccount.com`;
      this.__pulumiType = 'gcp:serviceaccount/account:Account';
      this.__name = name;
    }
  }
  return {
    storage: {
      BucketIAMMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      Bucket: MockBucket,
    },
    serviceaccount: {
      IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
      Account: MockServiceAccount,
    },
    organizations: {
      Project: vi.fn(function (this: any) {
        Object.assign(this, {
          __pulumiType: 'gcp:organizations/project:Project',
        });
      }),
      Folder: vi.fn(function (this: any) {
        Object.assign(this, {
          __pulumiType: 'gcp:organizations/folder:Folder',
        });
      }),
    },
    projects: {
      IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    },
    folder: {
      IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    },
    cloudrunv2: {
      ServiceIamMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      JobIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
      Service: vi.fn(function (this: any) {
        Object.assign(this, { __pulumiType: 'gcp:cloudrunv2/service:Service' });
      }),
      Job: vi.fn(function (this: any) {
        Object.assign(this, { __pulumiType: 'gcp:cloudrunv2/job:Job' });
      }),
    },
    secretmanager: {
      SecretIamMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      RegionalSecretIamMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      Secret: vi.fn(function (this: any) {
        Object.assign(this, { __pulumiType: 'gcp:secretmanager/secret:Secret' });
      }),
      RegionalSecret: vi.fn(function (this: any) {
        Object.assign(this, {
          __pulumiType: 'gcp:secretmanager/regionalSecret:RegionalSecret',
        });
      }),
    },
    artifactregistry: {
      RepositoryIamMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      Repository: vi.fn(function (this: any) {
        Object.assign(this, {
          __pulumiType: 'gcp:artifactregistry/repository:Repository',
        });
      }),
    },
    compute: {
      SubnetworkIAMMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      Subnetwork: vi.fn(function (this: any) {
        Object.assign(this, {
          __pulumiType: 'gcp:compute/subnetwork:Subnetwork',
        });
      }),
      InstanceIAMMember: vi
        .fn()
        .mockImplementation((name, args) => ({ name, args })),
      Instance: vi.fn(function (this: any) {
        Object.assign(this, { __pulumiType: 'gcp:compute/instance:Instance' });
      }),
    },
  };
});

interface CapturedBinding {
  name: string;
  args: { role?: unknown; member?: unknown };
}

function bindings(m: CloudInfraAccessMatrix): CapturedBinding[] {
  return m.getIamMembers() as unknown as CapturedBinding[];
}

describe('grant() ≡ equivalent single-rule CloudInfraAccessMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ResourceRegistry.clearCache();
    PrincipalFactory.clear();
  });

  test('emits byte-identical resource name + member for a string principal', () => {
    const bucket = TestResourceFactory.bucket('my-bucket');
    const principal = 'user:alice@example.com';
    const role = 'roles/storage.objectViewer';

    const viaGrant = grant(principal, role, bucket);
    const viaMatrix = new CloudInfraAccessMatrix({
      grant: { rules: [{ resource: bucket, role, principals: principal }] },
    });

    const g = bindings(viaGrant);
    const m = bindings(viaMatrix);

    expect(g).toHaveLength(1);
    expect(m).toHaveLength(1);
    expect(g[0].name).toBe(m[0].name);
    expect(g[0].name).toBe('my-bucket:storage.objectViewer:alice@example.com');
    expect(g[0].args.member).toBe(m[0].args.member);
    expect(g[0].args.member).toBe('user:alice@example.com');
  });

  test('label feeds the safeRole segment identically', () => {
    const bucket = TestResourceFactory.bucket('data');
    const role = 'roles/storage.admin';
    const principal = 'group:admins@example.com';

    const viaGrant = grant(principal, role, bucket, { label: 'data-admin' });
    const viaMatrix = new CloudInfraAccessMatrix({
      grant: {
        rules: [
          { resource: bucket, role, principals: principal, label: 'data-admin' },
        ],
      },
    });

    expect(bindings(viaGrant)[0].name).toBe(bindings(viaMatrix)[0].name);
    expect(bindings(viaGrant)[0].name).toBe(
      'data:data-admin:admins@example.com'
    );
  });

  test('multiple principals produce identical per-principal bindings', () => {
    const bucket = TestResourceFactory.bucket('shared');
    const role = 'roles/storage.objectViewer';
    const principals = ['user:a@example.com', 'group:b@example.com'];

    const viaGrant = grant(principals, role, bucket);
    const viaMatrix = new CloudInfraAccessMatrix({
      grant: { rules: [{ resource: bucket, role, principals }] },
    });

    const g = bindings(viaGrant).map(b => b.name);
    const m = bindings(viaMatrix).map(b => b.name);

    expect(g).toEqual(m);
    expect(g).toEqual([
      'shared:storage.objectViewer:a@example.com',
      'shared:storage.objectViewer:b@example.com',
    ]);
  });
});
