/**
 * DX1 — name-first CloudRunService equivalence (Frozen Contract F1 / F2).
 *
 * `new CloudInfraCloudRunService("api", { domain: "au", template: {...} })`
 * (name-first, v2 DX) must produce the IDENTICAL physical Service + NEG names
 * AND the identical child URNs as the legacy meta-first
 * `new CloudInfraCloudRunService(new CloudInfraMeta({ name: "api", domain: "au" }), {...})`.
 *
 * This component creates TWO children (Service + serverless NEG) whose names,
 * parents and aliases are derived from the meta + full config. The name-first
 * change only reroutes how the meta is obtained, so both children must stay
 * byte-identical. If they differ, switching a consuming stack to the name-first
 * overload would destroy/recreate the Service and/or NEG (F1/F2 violation).
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
  CloudInfraCloudRunService,
  CLOUD_RUN_SERVICE_TYPE,
} from '../../../components/cloudrunservice';

const T_SERVICE = 'gcp:cloudrunv2/service:Service';
const T_NEG = 'gcp:compute/regionNetworkEndpointGroup:RegionNetworkEndpointGroup';

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

const CONFIG = {
  template: {
    containers: [{ image: 'gcr.io/test-project/api:latest' }],
  },
};

describe('DX1 — name-first CloudRunService === meta-first (Service + NEG name + URN)', () => {
  let metaFirstName: string;
  let nameFirstName: string;
  let metaFirstServiceUrn: string;
  let nameFirstServiceUrn: string;
  let metaFirstNegUrn: string;
  let nameFirstNegUrn: string;
  let metaFirstComponentUrn: string;
  let nameFirstComponentUrn: string;

  beforeAll(async () => {
    // Meta-first (legacy) path.
    const metaFirst = new CloudInfraCloudRunService(
      new CloudInfraMeta({ name: 'api', domain: 'au' }),
      CONFIG
    );
    // Name-first (v2 DX) path.
    const nameFirst = new CloudInfraCloudRunService('api', {
      domain: 'au',
      ...CONFIG,
    });

    metaFirstName = await outStr(metaFirst.getName());
    nameFirstName = await outStr(nameFirst.getName());

    metaFirstServiceUrn = await urnOf(metaFirst.getService());
    nameFirstServiceUrn = await urnOf(nameFirst.getService());
    metaFirstNegUrn = await urnOf(metaFirst.getNetworkEndpointGroup());
    nameFirstNegUrn = await urnOf(nameFirst.getNetworkEndpointGroup());
    metaFirstComponentUrn = await urnOf(metaFirst);
    nameFirstComponentUrn = await urnOf(nameFirst);
  });

  it('both register exactly two Services and two NEGs', () => {
    expect(captured.filter(r => r.type === T_SERVICE).length).toBe(2);
    expect(captured.filter(r => r.type === T_NEG).length).toBe(2);
  });

  it('the generated Service NAME is identical (the F1 physical identity)', () => {
    expect(nameFirstName).toBe(metaFirstName);
    expect(nameFirstName).toContain('api');
  });

  it('the child Service + NEG resource NAMES captured by the mock are identical', () => {
    const services = captured.filter(r => r.type === T_SERVICE);
    const negs = captured.filter(r => r.type === T_NEG);
    expect(services[0].name).toBe(services[1].name);
    expect(negs[0].name).toBe(negs[1].name);
  });

  it('the component + Service + NEG URNs are identical (the F2 migration identity)', () => {
    expect(nameFirstComponentUrn).toBe(metaFirstComponentUrn);
    expect(nameFirstServiceUrn).toBe(metaFirstServiceUrn);
    expect(nameFirstNegUrn).toBe(metaFirstNegUrn);
    expect(nameFirstComponentUrn).toContain(CLOUD_RUN_SERVICE_TYPE);
  });
});
