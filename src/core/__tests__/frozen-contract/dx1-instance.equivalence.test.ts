/**
 * DX1 — name-first CloudInfraComputeInstance equivalence (Frozen Contract F1).
 *
 * `new CloudInfraComputeInstance("web", { domain: "au", machineType, ... })`
 * (name-first, v2 DX) must produce the IDENTICAL physical Instance NAME and the
 * identical Instance + component URNs as the legacy meta-first
 * `new CloudInfraComputeInstance(new CloudInfraMeta({ name: "web", domain: "au" }), {...})`.
 *
 * This component is ZONAL: its generated name is `meta.getName(zone)`, where the
 * zone is resolved by the existing precedence `config.zone` → `meta.getZone()`
 * → `${deriveRegion(meta)}-a` default. The name-first change ONLY reroutes how
 * the meta is obtained; the zonal-name derivation runs UNCHANGED on the resolved
 * meta. This test pins that the zonal name is byte-identical across BOTH paths
 * for all three zone branches:
 *   1. default `-a` zone   (no config.zone, region-domain meta)
 *   2. explicit config.zone
 *   3. meta zone           (location is a zone → meta.isLocationZone())
 *
 * If the zonal name differs, switching a consuming stack to the name-first
 * overload would destroy/recreate the instance (F1 violation).
 *
 * Mocks + config MUST be set before importing anything that builds resources.
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
import { CloudInfraMeta } from '../../meta';
import {
  CloudInfraComputeInstance,
  COMPUTE_INSTANCE_TYPE,
} from '../../../components/instance';

const T_INSTANCE = 'gcp:compute/instance:Instance';

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

const BASE_CONFIG = {
  machineType: 'e2-micro',
  bootDisk: {
    initializeParams: { image: 'debian-cloud/debian-11' },
  },
  networkInterfaces: [{ network: 'default' }],
};

describe('DX1 — name-first ComputeInstance === meta-first (zonal name + URN)', () => {
  // 1. default `-a` zone.
  let metaDefaultName: string;
  let nameDefaultName: string;
  let metaDefaultUrn: string;
  let nameDefaultUrn: string;
  let metaDefaultZone: string;
  let nameDefaultZone: string;
  // 2. explicit config.zone.
  let metaExplicitName: string;
  let nameExplicitName: string;
  // 3. meta zone (location is a zone).
  let metaZoneName: string;
  let nameZoneName: string;

  beforeAll(async () => {
    // 1. Default `-a` zone (region-domain meta, no config.zone).
    const metaDefault = new CloudInfraComputeInstance(
      new CloudInfraMeta({ name: 'web', domain: 'au' }),
      { ...BASE_CONFIG }
    );
    const nameDefault = new CloudInfraComputeInstance('web', {
      domain: 'au',
      ...BASE_CONFIG,
    });

    // 2. Explicit config.zone.
    const metaExplicit = new CloudInfraComputeInstance(
      new CloudInfraMeta({ name: 'db', domain: 'au' }),
      { ...BASE_CONFIG, zone: 'australia-southeast1-b' }
    );
    const nameExplicit = new CloudInfraComputeInstance('db', {
      domain: 'au',
      ...BASE_CONFIG,
      zone: 'australia-southeast1-b',
    });

    // 3. Meta zone — location set to a concrete zone → meta.isLocationZone().
    const metaZone = new CloudInfraComputeInstance(
      new CloudInfraMeta({
        name: 'cache',
        domain: 'au',
        location: 'australia-southeast1-c',
      }),
      { ...BASE_CONFIG }
    );
    const nameZone = new CloudInfraComputeInstance('cache', {
      domain: 'au',
      location: 'australia-southeast1-c',
      ...BASE_CONFIG,
    });

    metaDefaultName = await outStr(metaDefault.getName());
    nameDefaultName = await outStr(nameDefault.getName());
    metaDefaultUrn = await urnOf(metaDefault.getInstance());
    nameDefaultUrn = await urnOf(nameDefault.getInstance());
    metaDefaultZone = await outStr(metaDefault.getZone());
    nameDefaultZone = await outStr(nameDefault.getZone());

    metaExplicitName = await outStr(metaExplicit.getName());
    nameExplicitName = await outStr(nameExplicit.getName());

    metaZoneName = await outStr(metaZone.getName());
    nameZoneName = await outStr(nameZone.getName());
  });

  it('registers Instance children under the frozen type token', () => {
    const instances = captured.filter(r => r.type === T_INSTANCE);
    // 3 scenarios × 2 paths = 6 instances.
    expect(instances.length).toBe(6);
    expect(COMPUTE_INSTANCE_TYPE).toBe('cloud-infra:instance:ComputeInstance');
  });

  it('DEFAULT zone: zonal NAME is byte-identical name-first vs meta-first', () => {
    expect(nameDefaultName).toBe(metaDefaultName);
    // The derived zone is the `-a` default and matches across both paths.
    expect(nameDefaultZone).toBe(metaDefaultZone);
    expect(nameDefaultZone.endsWith('-a')).toBe(true);
    // Instance URN identical → in-place migration, no destroy/recreate.
    expect(nameDefaultUrn).toBe(metaDefaultUrn);
    expect(nameDefaultUrn).toContain(COMPUTE_INSTANCE_TYPE);
  });

  it('EXPLICIT config.zone: zonal NAME is byte-identical name-first vs meta-first', () => {
    expect(nameExplicitName).toBe(metaExplicitName);
  });

  it('META zone (location is a zone): zonal NAME is byte-identical name-first vs meta-first', () => {
    expect(nameZoneName).toBe(metaZoneName);
  });
});
