/**
 * DX1 — name-first HostProject equivalence (Frozen Contract F1 / F2).
 *
 * `new CloudInfraHostProject("net", { domain: "au" })` (name-first, v2 DX) must
 * produce the IDENTICAL physical Project name AND identical deep-child names
 * (incl. the `:`-delimited API/service names and the Shared-VPC network) as the
 * legacy meta-first
 * `new CloudInfraHostProject(new CloudInfraMeta({ name: "net", domain: "au" }), {})`.
 *
 * `CloudInfraHostProject` builds ~10 deep-nested children plus two dynamic
 * providers (bootstrap + delay); their names/parents/aliases are derived from
 * the meta + full config. The name-first change only reroutes how the meta is
 * obtained, so every captured child name must stay byte-identical. If they
 * differ, switching a consuming stack to the name-first overload would
 * destroy/recreate the project and its network (F1/F2 violation). This mirrors
 * `dx1-cloudrunservice.equivalence.test.ts`.
 *
 * Uses `pulumi.runtime.setMocks` (the f2-alias pattern) to capture each child's
 * computed NAME and URN. Mocks + config MUST be set before importing anything
 * that builds resources.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Neuter the two DYNAMIC providers (bootstrap + delay) exactly as
// `f2-project-names.golden.test.ts` does — their `create` closures capture
// native Node fns that Pulumi's mock serializer rejects. ONLY these two are
// stubbed; every real `gcp.*` child registers with the mock and is captured, so
// the asserted NAMES come from the shipping code (not a re-implementation).
vi.mock('../../../organization/project/bootstrap', () => {
  class ServiceUsageApiBootstrap extends pulumi.ComponentResource {
    constructor(name: string, _args: unknown, opts?: unknown) {
      super(
        'test:mock:ServiceUsageApiBootstrap',
        name,
        {},
        opts as pulumi.ComponentResourceOptions
      );
    }
  }
  return { ServiceUsageApiBootstrap };
});
vi.mock('../../../organization/project/common', async () => {
  const actual = await vi.importActual<
    typeof import('../../../organization/project/common')
  >('../../../organization/project/common');
  class DelayResource extends pulumi.ComponentResource {
    constructor(name: string, _delayMs: number, opts?: unknown) {
      super(
        'test:mock:DelayResource',
        name,
        {},
        opts as pulumi.ComponentResourceOptions
      );
    }
  }
  return { ...actual, DelayResource };
});

pulumi.runtime.setConfig('gcp:project', 'test-project');
pulumi.runtime.setConfig('cloudInfra:organizationId', '111111111111');
pulumi.runtime.setConfig('cloudInfra:billingAccountId', 'AAAAAA-BBBBBB-CCCCCC');
pulumi.runtime.setConfig('cloudInfra:organizationName', 'test-org');

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
        state: {
          ...args.inputs,
          name: args.inputs.name ?? args.name,
          // `projectId`/`number` are read downstream while wiring children.
          projectId: args.inputs.projectId ?? args.name,
          number: '123456789012',
        },
      };
    },
    call(): Record<string, unknown> {
      return {};
    },
  },
  'project',
  'stack'
);

// Import AFTER mocks are configured. The project component is imported
// DYNAMICALLY inside `beforeAll` (mirroring the golden test) so its module —
// which reads `gcpConfig.billingAccountId` at load via a Zod schema default —
// evaluates only after the `setConfig` calls above have run.
import { CloudInfraMeta } from '../../meta';

const T_PROJECT = 'gcp:organizations/project:Project';
const T_NETWORK = 'gcp:compute/network:Network';

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

/**
 * Wait until resource registration goes QUIESCENT (count unchanged across two
 * polls). The project emits its children across several async ticks
 * (service-identity wiring), so a fixed delay is race-prone. Capped so a
 * genuine hang fails fast.
 */
async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

describe('DX1 — name-first HostProject === meta-first (Project + child names + URN)', () => {
  let metaFirstName: string;
  let nameFirstName: string;
  let metaFirstProjectUrn: string;
  let nameFirstProjectUrn: string;
  let metaFirstNetworkUrn: string;
  let nameFirstNetworkUrn: string;
  let metaFirstComponentUrn: string;
  let nameFirstComponentUrn: string;

  let CLOUD_INFRA_HOST_PROJECT_TYPE: string;

  beforeAll(async () => {
    const host = await import('../../../organization/project/host');
    const CloudInfraHostProject = host.CloudInfraHostProject;
    CLOUD_INFRA_HOST_PROJECT_TYPE = host.CLOUD_INFRA_HOST_PROJECT_TYPE;

    // Meta-first (legacy) path.
    const metaFirst = new CloudInfraHostProject(
      new CloudInfraMeta({ name: 'net', domain: 'au' }),
      {}
    );
    // Name-first (v2 DX) path.
    const nameFirst = new CloudInfraHostProject('net', { domain: 'au' });

    metaFirstName = await outStr(metaFirst.getProjectId());
    nameFirstName = await outStr(nameFirst.getProjectId());

    metaFirstProjectUrn = await urnOf(metaFirst.getProject());
    nameFirstProjectUrn = await urnOf(nameFirst.getProject());
    metaFirstNetworkUrn = await urnOf(metaFirst.getSharedVpcNetwork());
    nameFirstNetworkUrn = await urnOf(nameFirst.getSharedVpcNetwork());
    metaFirstComponentUrn = await urnOf(metaFirst);
    nameFirstComponentUrn = await urnOf(nameFirst);

    // Let every deep child (Project, `:`-delimited services, Network, identities)
    // finish registering before asserting on names.
    await waitForCaptures();
  });

  it('both register exactly two Projects and two Networks', () => {
    expect(captured.filter(r => r.type === T_PROJECT).length).toBe(2);
    expect(captured.filter(r => r.type === T_NETWORK).length).toBe(2);
  });

  it('the generated Project NAME is identical (the F1 physical identity)', () => {
    expect(nameFirstName).toBe(metaFirstName);
    expect(nameFirstName).toContain('net');
  });

  it('the child Project + Network resource NAMES captured by the mock are identical', () => {
    const projects = captured.filter(r => r.type === T_PROJECT);
    const networks = captured.filter(r => r.type === T_NETWORK);
    expect(projects[0].name).toBe(projects[1].name);
    expect(networks[0].name).toBe(networks[1].name);
  });

  it('a representative `:`-delimited API/service child NAME is identical name-first vs meta-first', () => {
    // e.g. `<project>:serviceusage-googleapis-com` — the colon-delimited service
    // names are the f2-project-names golden's load-bearing convention. Capture
    // every gcp.projects.Service child and assert the name-first set equals the
    // meta-first set byte-for-byte.
    const services = captured.filter(
      r => r.type === 'gcp:projects/service:Service'
    );
    expect(services.length).toBeGreaterThan(0);
    // Registration order is async/interleaved across the two constructions, so
    // compare the NAME multiset: each `:`-delimited service name produced by an
    // identical construction must appear EXACTLY twice (an odd count ⇒ a name
    // diverged between name-first and meta-first).
    const counts = new Map<string, number>();
    for (const r of services) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
    const odd = [...counts.entries()].filter(([, n]) => n % 2 !== 0);
    expect(odd).toEqual([]);
    // Sanity: the colon-delimited serviceusage child is present.
    expect(
      [...counts.keys()].some(n => n.endsWith(':serviceusage-googleapis-com'))
    ).toBe(true);
  });

  it('the component + Project + Network URNs are identical (the F2 migration identity)', () => {
    expect(nameFirstComponentUrn).toBe(metaFirstComponentUrn);
    expect(nameFirstProjectUrn).toBe(metaFirstProjectUrn);
    expect(nameFirstNetworkUrn).toBe(metaFirstNetworkUrn);
    expect(nameFirstComponentUrn).toContain(CLOUD_INFRA_HOST_PROJECT_TYPE);
  });
});
