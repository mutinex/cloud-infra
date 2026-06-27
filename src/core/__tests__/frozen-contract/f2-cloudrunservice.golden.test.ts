/**
 * Frozen Contract F2 / alias — CloudRunService (the v2 PROTOTYPE component).
 *
 * See `docs/v2-redesign-notes.md` §7 (prototype: Service + NEG, the smallest
 * thing that proves the whole pathway) and §9 (the REAL `pulumi preview` against
 * dataos `dev` that validated it migrates in-place: Service update-in-place via
 * `{ parent: rootStackResource }`; NEG → no change via parent-alias inheritance,
 * NO explicit NEG alias needed).
 *
 * This is the canonical "pattern (b)" case (parent-inherited grandchild = the
 * NEG, parented to the Service, with NO explicit alias of its own). It is
 * pinned here in its OWN file because it is the load-bearing prototype and the
 * §9 real-preview anchor.
 *
 * Uses `pulumi.runtime.setMocks` (the prototype pattern). See the honesty note
 * in f2-alias.golden.test.ts: the NEG's parent-alias INHERITANCE is NOT
 * reproduced under mocks (its computed `__aliases` is empty); the real preview
 * (§9) is the authority for the NEG migrating in-place.
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

import { CloudInfraMeta } from '../../meta';
import {
  CloudInfraCloudRunService,
  CLOUD_RUN_SERVICE_TYPE,
} from '../../../components/cloudrunservice';

const T_SERVICE = 'gcp:cloudrunv2/service:Service';
const T_NEG =
  'gcp:compute/regionNetworkEndpointGroup:RegionNetworkEndpointGroup';

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

function capturedNames(type: string): string[] {
  return captured.filter(r => r.type === type).map(r => r.name);
}

/** Wait until resource registration goes quiescent (see f2-alias.golden). */
async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

const EXPECTED_NAME = 'project-api-au';
// NB: the `service` label is the value the converted component passes as the
// component `name` to the base — which is the GENERATED name (`resourceName`),
// not the raw input `api` (cloudrunservice/index.ts:75-81 passes `resourceName`
// for both). Pin the actual stamped value.
const EXPECTED_LABELS = {
  domain: 'au',
  env: 'stack',
  service: 'project-api-au',
  'managed-by': 'cloud-infra',
};

describe('F2/alias — CloudRunService prototype (Service + NEG)', () => {
  let component: CloudInfraCloudRunService;

  beforeAll(async () => {
    component = new CloudInfraCloudRunService(
      new CloudInfraMeta({ name: 'api', domain: 'au' }),
      { template: { containers: [{ image: 'gcr.io/test-project/api:latest' }] } }
    );
    await waitForCaptures();
  });

  it('component type token is the frozen `cloud-infra:cloudrunservice:CloudRunService` (§8: baked into NEW URNs)', () => {
    expect(CLOUD_RUN_SERVICE_TYPE).toBe(
      'cloud-infra:cloudrunservice:CloudRunService'
    );
  });

  it('Service + NEG NAMES are byte-identical (F1; both share the generated name)', () => {
    expect(capturedNames(T_SERVICE)).toEqual([EXPECTED_NAME]);
    expect(capturedNames(T_NEG)).toEqual([EXPECTED_NAME]);
  });

  it('Service aliases back to its OLD flat root URN (the §9 in-place migration)', async () => {
    const aliases = await resolveAliases(component.service);
    expect(aliases).toEqual([oldFlatUrn(T_SERVICE, EXPECTED_NAME)]);
  });

  it('NEG (parent-inherited grandchild) has NO computed alias under mocks (documented limitation — §9 real preview is the authority)', async () => {
    // The NEG is created with `childOpts({ parent: this.service })` and NO
    // explicit alias (cloudrunservice/index.ts). It relies on parent-alias
    // INHERITANCE from the root-aliased Service. `setMocks` does NOT reconstruct
    // that — the computed `__aliases` is EMPTY here. §9 confirmed via a real
    // `pulumi preview` that the NEG lands in `unchanged` (no explicit alias
    // needed). We pin the observed-empty value so any change is visible and
    // re-triggers real-preview confirmation; this is NOT in-repo proof of the
    // NEG's in-place migration.
    const aliases = await resolveAliases(component.networkEndpointGroup);
    expect(aliases).toEqual([]);
  });

  it('org labels are stamped on the Service (label-supporting child)', () => {
    const svc = captured.find(r => r.type === T_SERVICE);
    expect(svc?.inputs.labels).toEqual(EXPECTED_LABELS);
  });

  it('NEG is in LABEL_UNSUPPORTED_TYPES → labels are NOT injected (would hard-error)', () => {
    // Frozen Trap §8: the serverless NEG has no `labels` input; the base
    // transformation must SKIP it. Pin that no labels reached the NEG.
    const neg = captured.find(r => r.type === T_NEG);
    expect(neg?.inputs.labels).toBeUndefined();
  });
});
