/**
 * Frozen Contract F2 — Host Project deep-nesting: root-alias + the `:`-delimited
 * child NAME conventions.
 *
 * See `docs/v2-redesign-notes.md` §2 (F2 — `:`-delimited project/folder names),
 * §3 trap 2 (`getResourceName()` feeds IAM naming), and §9c (org/project real
 * preview: Project update-in-place via root-alias; all deep children land in
 * `unchanged` via parent-alias inheritance — no explicit child aliases).
 *
 * Pins (all from REAL captures of the source-produced resources):
 *
 *  1. The label-supporting `gcp.organizations.Project` carries an alias back to
 *     its OLD FLAT root URN (in-place migration).
 *  2. The deterministic `:`-delimited / suffixed child NAME strings the project
 *     component actually emits (the `gcp.projects.Service` per-API names, the
 *     `TagBinding`/`ServiceIdentity`/`Network`/`SharedVPCHostProject` names).
 *
 * ── MOCKING THE DYNAMIC PROVIDERS (not the naming) ───────────────────────────
 * The project component creates two Pulumi DYNAMIC providers
 * (`ServiceUsageApiBootstrap`, `DelayResource`) whose `create` closures capture
 * native Node fns (`execSync`, `Date.now`); under `pulumi.runtime.setMocks`
 * Pulumi tries to serialize them and REJECTS — pure test noise. We replace ONLY
 * those two dynamic providers with no-op `ComponentResource`s (mirroring the
 * repo's ALB tests, which `vi.mock` the side-effecting factory modules). With
 * them neutered, every REAL `gcp.*` child (Project, Service, TagBinding,
 * ServiceIdentity, Network, SharedVPCHostProject) registers with the mock and is
 * captured directly — NO naming/aliasing logic is stubbed, so the pinned NAMES
 * below come from the shipping code, not a re-implementation. (A real
 * `pulumi preview` — §9c — additionally validates in-place migration.)
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

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
}
const captured: CapturedResource[] = [];

pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
      captured.push({ type: args.type, name: args.name });
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

import { CloudInfraMeta } from '../../meta';

const T_PROJECT = 'gcp:organizations/project:Project';
const T_SERVICE = 'gcp:projects/service:Service';
const T_TAG_BINDING = 'gcp:tags/tagBinding:TagBinding';
const T_SERVICE_IDENTITY = 'gcp:projects/serviceIdentity:ServiceIdentity';
const T_NETWORK = 'gcp:compute/network:Network';
const T_SHARED_VPC_HOST = 'gcp:compute/sharedVPCHostProject:SharedVPCHostProject';

// Use omitDomain so the generated name is the simple `project-plat` form used
// throughout the §9c validation notes.
const CN = 'project-plat';

function oldFlatUrn(type: string, name: string): string {
  return `urn:pulumi:stack::project::${type}::${name}`;
}

async function resolveAliases(resource: unknown): Promise<string[]> {
  const aliases = (resource as { __aliases?: pulumi.Output<string>[] })
    .__aliases;
  if (!aliases || aliases.length === 0) return [];
  return Promise.all(
    aliases.map(
      a =>
        new Promise<string>(resolve => {
          (a as pulumi.Output<string>).apply(v => {
            resolve(v);
            return v;
          });
        })
    )
  );
}

function names(type: string): string[] {
  return captured.filter(c => c.type === type).map(c => c.name);
}

/**
 * Wait until resource registration goes QUIESCENT (count unchanged across two
 * polls) instead of a fixed sleep. The project emits its children across
 * several async ticks (service-identity wiring), so a fixed delay is especially
 * race-prone here. Capped so a genuine hang fails fast.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let host: any;

describe('F2 — HostProject deep-nesting (real-capture root-alias + child names)', () => {
  beforeAll(async () => {
    const { CloudInfraHostProject, CLOUD_INFRA_HOST_PROJECT_TYPE } =
      await import('../../../organization/project/host');
    expect(CLOUD_INFRA_HOST_PROJECT_TYPE).toBe(
      'cloud-infra:project:CloudInfraHostProject'
    );
    host = new CloudInfraHostProject(
      new CloudInfraMeta({
        name: 'plat',
        domain: 'au',
        omitDomain: true,
        gcpProject: 'test-project',
      }),
      {
        // Drive a representative set of children: an identity-needing API and a
        // tag binding, so the per-API / identity / tag-binding name formulas
        // are all exercised against the real source.
        services: ['run.googleapis.com'],
        cloudInfraTags: ['tagValues/123456'],
      } as never
    );
    await waitForCaptures();
  });

  it('generated component name is byte-identical (F1, omitDomain → prefix-name)', () => {
    expect(host.getGeneratedName()).toBe(CN);
  });

  // ── Project root-alias + name ───────────────────────────────────────────
  it('Project child aliases back to its OLD flat root URN (in-place migration)', async () => {
    expect(await resolveAliases(host.getProject())).toEqual([
      oldFlatUrn(T_PROJECT, CN),
    ]);
  });

  it('Project child NAME is byte-identical', () => {
    expect(names(T_PROJECT)).toEqual([CN]);
  });

  // ── `:`-delimited child NAMES (captured from the SHIPPING code) ─────────
  it('per-API `gcp.projects.Service` names use the frozen `${cn}:${sanitized-api}` convention', () => {
    // Order = service-usage bootstrap first, then baseline APIs
    // (cloudresourcemanager, compute), then user APIs (run). The set + the
    // `:`-delimited sanitisation (dots → `-`, capped at 60) is the F2 contract.
    expect(names(T_SERVICE)).toEqual([
      'project-plat:serviceusage-googleapis-com',
      'project-plat:cloudresourcemanager-googleapis-com',
      'project-plat:compute-googleapis-com',
      'project-plat:run-googleapis-com',
    ]);
  });

  it('TagBinding name uses the frozen `${cn}:ProjectTagBinding:${tagKey}` convention', () => {
    expect(names(T_TAG_BINDING)).toEqual([
      'project-plat:ProjectTagBinding:123456',
    ]);
  });

  it('ServiceIdentity name uses the frozen `${cn}:${apiShortName}-identity` convention', () => {
    expect(names(T_SERVICE_IDENTITY)).toEqual(['project-plat:run-identity']);
  });

  it('shared-VPC Network + SharedVPCHostProject reuse the bare component name', () => {
    expect(names(T_NETWORK)).toEqual([CN]);
    expect(names(T_SHARED_VPC_HOST)).toEqual([CN]);
  });
});
