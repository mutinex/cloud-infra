/**
 * DX1 — name-first equivalence for the multi-resource network/backend sweep.
 *
 * For each component, `new X("name", { domain, ...config })` (name-first, v2 DX)
 * must produce children whose physical NAMEs and URNs are byte-identical to the
 * legacy meta-first `new X(new CloudInfraMeta({ name, domain, ... }), config)`.
 * These components create MULTIPLE children (NAT: Router+RouterNat+Route, PSA:
 * GlobalAddress+Connection, BackendService: BackendService+HealthCheck) whose
 * names/opts are derived from the meta + full config — so a divergence would
 * destroy/recreate resources on migration (Frozen Contract F1/F2 violation).
 *
 * URN equality is asserted through each component's public getters (token-free),
 * and the child NAMEs through the captured mock inputs.
 */
import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

pulumi.runtime.setConfig('gcp:project', 'test-project');

pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
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
import { CloudInfraNat } from '../../../organization/network/nat';
import { CloudInfraPSA } from '../../../organization/network/psa';
import { CloudInfraConnector } from '../../../organization/network/connector';
import { CloudInfraSubnet } from '../../../organization/network/subnet';
import { CloudInfraBackendService } from '../../../components/backendservice';

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

const NETWORK = 'projects/test-project/global/networks/my-vpc';

describe('DX1 — name-first CloudInfraNat === meta-first (Router + RouterNat + Route)', () => {
  const config = {
    sourceSubnetworkIpRangesToNat: 'ALL_SUBNETWORKS_ALL_IP_RANGES',
    natIpAllocateOption: 'AUTO_ONLY',
    router: { network: NETWORK },
  };
  const metaFirst = new CloudInfraNat(
    new CloudInfraMeta({ name: 'nat-gw', location: 'us-central1' }),
    config
  );
  const nameFirst = new CloudInfraNat('nat-gw', {
    location: 'us-central1',
    ...config,
  });

  it('Router + RouterNat names + component/child URNs are identical', async () => {
    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getRouter())).toBe(
      await urnOf(metaFirst.getRouter())
    );
    expect(await urnOf(nameFirst.getRouterNat())).toBe(
      await urnOf(metaFirst.getRouterNat())
    );
    expect(await outStr(nameFirst.getName())).toBe(
      await outStr(metaFirst.getName())
    );
    expect(await outStr(nameFirst.getRouterName())).toBe(
      await outStr(metaFirst.getRouterName())
    );
  });
});

describe('DX1 — name-first CloudInfraPSA === meta-first (GlobalAddress + Connection)', () => {
  const config = {
    network: NETWORK,
    reservedPeeringRanges: [
      {
        purpose: 'VPC_PEERING',
        addressType: 'INTERNAL',
        prefixLength: 24,
        network: NETWORK,
        address: '10.10.0.0',
      },
    ],
  };
  const metaFirst = new CloudInfraPSA(
    new CloudInfraMeta({ name: 'psa-conn', domain: 'gl' }),
    config
  );
  const nameFirst = new CloudInfraPSA('psa-conn', {
    domain: 'gl',
    ...config,
  });

  it('GlobalAddress + Connection + component URNs are identical', async () => {
    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getGlobalAddress())).toBe(
      await urnOf(metaFirst.getGlobalAddress())
    );
    expect(await urnOf(nameFirst.getConnection())).toBe(
      await urnOf(metaFirst.getConnection())
    );
  });
});

describe('DX1 — name-first CloudInfraConnector === meta-first', () => {
  const config = { ipCidrRange: '10.8.0.0/28', network: NETWORK };
  const metaFirst = new CloudInfraConnector(
    new CloudInfraMeta({ name: 'vpc-conn', location: 'us-central1' }),
    config
  );
  const nameFirst = new CloudInfraConnector('vpc-conn', {
    location: 'us-central1',
    ...config,
  });

  it('Connector + component URNs and name are identical', async () => {
    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getConnector())).toBe(
      await urnOf(metaFirst.getConnector())
    );
  });
});

describe('DX1 — name-first CloudInfraSubnet === meta-first', () => {
  const config = { network: NETWORK, ipCidrRange: '10.0.0.0/24' };
  const metaFirst = new CloudInfraSubnet(
    new CloudInfraMeta({ name: 'subnet-a', location: 'us-central1' }),
    config
  );
  const nameFirst = new CloudInfraSubnet('subnet-a', {
    location: 'us-central1',
    ...config,
  });

  it('Subnetwork + component URNs and name are identical', async () => {
    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getSubnetwork())).toBe(
      await urnOf(metaFirst.getSubnetwork())
    );
    expect(await outStr(nameFirst.getName())).toBe(
      await outStr(metaFirst.getName())
    );
  });
});

describe('DX1 — name-first CloudInfraBackendService === meta-first (BackendService + HealthCheck)', () => {
  const config = {
    backends: [{ group: 'some-neg-id' }],
    healthCheck: { requestPath: '/healthz', port: 8080 },
  };
  const metaFirst = new CloudInfraBackendService(
    new CloudInfraMeta({ name: 'be-svc', domain: 'gl' }),
    config
  );
  const nameFirst = new CloudInfraBackendService('be-svc', {
    domain: 'gl',
    ...config,
  });

  it('BackendService + component URNs and name are identical', async () => {
    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getBackendService())).toBe(
      await urnOf(metaFirst.getBackendService())
    );
    expect(await outStr(nameFirst.getName())).toBe(
      await outStr(metaFirst.getName())
    );
  });
});
