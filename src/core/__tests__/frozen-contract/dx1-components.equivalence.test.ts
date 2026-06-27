/**
 * DX1 — name-first component equivalence (Frozen Contract F1 / F2).
 *
 * Mirrors `dx1-bucket.equivalence.test.ts` for three representative single-resource
 * components — Account, SecretVersion, Role — across the access-matrix principal
 * (Account), a regional secret, and a principal/resource role.
 *
 * For each: `new <Component>("name", { domain, ...config })` (name-first, v2 DX)
 * MUST produce the IDENTICAL generated NAME AND the identical component + child
 * URN as the legacy meta-first `new <Component>(new CloudInfraMeta({ name, domain }),
 * config)`. If they differ, switching a consuming stack to the name-first overload
 * would destroy/recreate the resource (F1/F2 violation).
 *
 * Uses `pulumi.runtime.setMocks` (the f2-alias pattern) to capture each child's
 * computed NAME and URN. Mocks + config MUST be set before importing anything
 * that builds resources.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

pulumi.runtime.setConfig('gcp:project', 'test-project');

interface CapturedResource {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}
const captured: CapturedResource[] = [];

pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
      captured.push({ type: args.type, name: args.name, inputs: args.inputs });
      return {
        id: `${args.name}-id`,
        state: { ...args.inputs, name: args.inputs.name ?? args.name },
      };
    },
    call(args: pulumi.runtime.MockCallArgs): Record<string, unknown> {
      // gcp.iam.getRuleOutput / getTestablePermissions (Role) resolve through
      // here. Both shapes expect a `permissions` array; provide empty lists so
      // the Role permission pipeline resolves cleanly. The assertions only
      // compare NAME + URN, not the permission set.
      void args;
      return { permissions: [], includedPermissions: [] };
    },
  },
  'project',
  'stack'
);

// Import AFTER mocks are configured.
import { CloudInfraMeta } from '../../meta';
import {
  CloudInfraAccount,
  ACCOUNT_TYPE,
} from '../../../components/account/single';
import { CloudInfraSecretVersion, SECRET_VERSION_TYPE } from '../../../components/secret';
import { CloudInfraRole, ROLE_TYPE } from '../../../components/role';

const T_SA = 'gcp:serviceaccount/account:Account';
const T_REGIONAL_SECRET = 'gcp:secretmanager/regionalSecret:RegionalSecret';
const T_PROJECT_ROLE = 'gcp:projects/iAMCustomRole:IAMCustomRole';

/** Resolve a resource's URN string. */
async function urnOf(resource: pulumi.Resource): Promise<string> {
  return new Promise<string>(resolve => {
    resource.urn.apply(u => {
      resolve(u);
      return u;
    });
  });
}

/** Resolve a `pulumi.Output<string>` to its concrete value. */
async function outStr(out: pulumi.Output<string>): Promise<string> {
  return new Promise<string>(resolve => {
    out.apply(v => {
      resolve(v);
      return v;
    });
  });
}

describe('DX1 — name-first CloudInfraAccount === meta-first (name + URN)', () => {
  let mfName: string;
  let nfName: string;
  let mfChildUrn: string;
  let nfChildUrn: string;
  let mfComponentUrn: string;
  let nfComponentUrn: string;

  beforeAll(async () => {
    const metaFirst = new CloudInfraAccount(
      new CloudInfraMeta({ name: 'application', domain: 'au' })
    );
    const nameFirst = new CloudInfraAccount('application', { domain: 'au' });

    // getEmail() is the access-matrix principal surface — assert it is unchanged.
    mfName = await outStr(metaFirst.getEmail());
    nfName = await outStr(nameFirst.getEmail());

    mfChildUrn = await urnOf(metaFirst.serviceAccount);
    nfChildUrn = await urnOf(nameFirst.serviceAccount);
    mfComponentUrn = await urnOf(metaFirst);
    nfComponentUrn = await urnOf(nameFirst);
  });

  it('the SA email (access-matrix principal identity) is identical', () => {
    expect(nfName).toBe(mfName);
  });

  it('the component + child URN are identical (F2 migration identity)', () => {
    expect(nfComponentUrn).toBe(mfComponentUrn);
    expect(nfChildUrn).toBe(mfChildUrn);
    expect(nfComponentUrn).toContain(ACCOUNT_TYPE);
  });

  it('the child SA NAME captured by the mock is identical', () => {
    const sas = captured.filter(r => r.type === T_SA);
    expect(sas.length).toBe(2);
    expect(sas[0].name).toBe(sas[1].name);
  });
});

describe('DX1 — name-first CloudInfraSecretVersion === meta-first (name + URN)', () => {
  let mfName: string;
  let nfName: string;
  let mfChildUrn: string;
  let nfChildUrn: string;
  let mfComponentUrn: string;
  let nfComponentUrn: string;

  beforeAll(async () => {
    const metaFirst = new CloudInfraSecretVersion(
      new CloudInfraMeta({ name: 'api-key', domain: 'au' }),
      { secretData: 'shh' }
    );
    const nameFirst = new CloudInfraSecretVersion('api-key', {
      domain: 'au',
      secretData: 'shh',
    });

    mfName = await outStr(metaFirst.getName());
    nfName = await outStr(nameFirst.getName());

    mfChildUrn = await urnOf(metaFirst.getSecret());
    nfChildUrn = await urnOf(nameFirst.getSecret());
    mfComponentUrn = await urnOf(metaFirst);
    nfComponentUrn = await urnOf(nameFirst);
  });

  it('the generated secret NAME is identical (F1 physical identity)', () => {
    expect(nfName).toBe(mfName);
  });

  it('the component + secret child URN are identical (F2 migration identity)', () => {
    expect(nfComponentUrn).toBe(mfComponentUrn);
    expect(nfChildUrn).toBe(mfChildUrn);
    expect(nfComponentUrn).toContain(SECRET_VERSION_TYPE);
  });

  it('the child RegionalSecret NAME captured by the mock is identical', () => {
    const secrets = captured.filter(r => r.type === T_REGIONAL_SECRET);
    expect(secrets.length).toBe(2);
    expect(secrets[0].name).toBe(secrets[1].name);
  });
});

describe('DX1 — name-first CloudInfraRole === meta-first (name + URN + getMeta)', () => {
  let mfChildUrn: string;
  let nfChildUrn: string;
  let mfComponentUrn: string;
  let nfComponentUrn: string;
  let mfMetaName: string;
  let nfMetaName: string;

  beforeAll(async () => {
    const metaFirst = new CloudInfraRole(
      new CloudInfraMeta({ name: 'folder-admin', omitPrefix: true }),
      { title: 'Folder Admin' }
    );
    const nameFirst = new CloudInfraRole('folder-admin', {
      naming: 'no-prefix',
      title: 'Folder Admin',
    });

    mfChildUrn = await urnOf(metaFirst.getRole());
    nfChildUrn = await urnOf(nameFirst.getRole());
    mfComponentUrn = await urnOf(metaFirst);
    nfComponentUrn = await urnOf(nameFirst);

    // getMeta() is the access-matrix resource surface — assert it is unchanged.
    mfMetaName = metaFirst.getMeta().getName();
    nfMetaName = nameFirst.getMeta().getName();
  });

  it('getMeta().getName() (access-matrix resource identity) is identical', () => {
    expect(nfMetaName).toBe(mfMetaName);
  });

  it('the component + role child URN are identical (F2 migration identity)', () => {
    expect(nfComponentUrn).toBe(mfComponentUrn);
    expect(nfChildUrn).toBe(mfChildUrn);
    expect(nfComponentUrn).toContain(ROLE_TYPE);
  });

  it('the child custom-role NAME captured by the mock is identical', () => {
    const roles = captured.filter(r => r.type === T_PROJECT_ROLE);
    expect(roles.length).toBe(2);
    expect(roles[0].name).toBe(roles[1].name);
  });
});
