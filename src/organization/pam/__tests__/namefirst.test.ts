/**
 * WS-C Task 1 — `CloudInfraEntitlement` name-first ≡ meta-first equivalence.
 *
 * Proves the new `new CloudInfraEntitlement(name, args?, opts?)` overload
 * produces an Entitlement INDISTINGUISHABLE from the legacy meta-first
 * `new CloudInfraEntitlement(new CloudInfraMeta({ name, ... }), config)` form.
 *
 * Pinned (state-sensitive surfaces): component label `getGeneratedName()`, the
 * Entitlement's `entitlementId` (= generated name, the GCP identity), the
 * captured Pulumi resource name, and the resolved `location` + `maxRequestDuration`.
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
    call(): Record<string, unknown> {
      return {};
    },
  },
  'project',
  'stack'
);

// Import AFTER mocks are configured.
import { CloudInfraMeta } from '../../../core/meta';
import { CloudInfraEntitlement } from '../index';

const T_ENT = 'gcp:privilegedaccessmanager/entitlement:entitlement';

function read<T>(out: pulumi.Output<T>): Promise<T> {
  return new Promise<T>(resolve => {
    out.apply(v => {
      resolve(v);
      return v;
    });
  });
}

async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

// No explicit `location` here — for the entitlement, `location` is a naming
// input (NamingArgs) on the name-first surface, not a config field, so the
// shared `baseConfig` deliberately omits it (the resolved API location defaults
// to 'global' for the `gl` domain in both paths).
const baseConfig = {
  maxRequestDuration: '7200s',
  eligibleUsers: [{ principals: ['group:eng@example.com'] }],
  privilegedAccess: {
    gcpIamAccess: {
      roleBindings: [{ role: 'roles/viewer' }],
      resource: '/projects/my-proj',
      resourceType: 'project',
    },
  },
};

describe('WS-C Task 1 — CloudInfraEntitlement name-first ≡ meta-first', () => {
  let meta_ent: CloudInfraEntitlement;
  let name_ent: CloudInfraEntitlement;

  beforeAll(async () => {
    meta_ent = new CloudInfraEntitlement(
      new CloudInfraMeta({ name: 'breakglass', domain: 'gl' }),
      { ...baseConfig }
    );
    name_ent = new CloudInfraEntitlement('breakglass', {
      domain: 'gl',
      ...baseConfig,
    });
    await waitForCaptures();
  });

  it('component label (getGeneratedName) is identical', () => {
    expect(name_ent.getGeneratedName()).toBe(meta_ent.getGeneratedName());
    // conventional formula: prefix-name-loc.
    expect(meta_ent.getGeneratedName()).toBe('project-breakglass-gl');
  });

  it('Entitlement entitlementId (generated name → GCP identity) is identical', async () => {
    const metaId = await read(meta_ent.getEntitlement().entitlementId);
    const nameId = await read(name_ent.getEntitlement().entitlementId);
    expect(nameId).toBe(metaId);
    expect(metaId).toBe('project-breakglass-gl');
  });

  it('resolved location and maxRequestDuration key fields are identical', async () => {
    const metaLoc = await read(meta_ent.getEntitlement().location);
    const nameLoc = await read(name_ent.getEntitlement().location);
    expect(nameLoc).toBe(metaLoc);
    // domain `gl` + no explicit location → defaulted to 'global'.
    expect(metaLoc).toBe('global');

    const metaDur = await read(meta_ent.getEntitlement().maxRequestDuration);
    const nameDur = await read(name_ent.getEntitlement().maxRequestDuration);
    expect(nameDur).toBe(metaDur);
    expect(metaDur).toBe('7200s');
  });

  it('captured Entitlement resource names match across overloads', () => {
    const names = captured.filter(r => r.type === T_ENT).map(r => r.name);
    expect(names.filter(n => n === 'project-breakglass-gl').length).toBe(2);
  });
});
