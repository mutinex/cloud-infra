/**
 * DX1 — name-first Bucket equivalence (Frozen Contract F1 / F2).
 *
 * `new CloudInfraBucket("assets", { domain: "au" })` (name-first, v2 DX) must
 * produce the IDENTICAL physical bucket name AND the identical child URN as the
 * legacy meta-first `new CloudInfraBucket(new CloudInfraMeta({ name: "assets",
 * domain: "au" }))`. If they differ, switching a consuming stack to the
 * name-first overload would destroy/recreate the bucket (F1/F2 violation).
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
import { CloudInfraBucket, BUCKET_TYPE } from '../../../components/bucket/single';

const T_BUCKET = 'gcp:storage/bucket:Bucket';

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

describe('DX1 — name-first Bucket === meta-first Bucket (name + URN)', () => {
  let metaFirstName: string;
  let nameFirstName: string;
  let metaFirstUrn: string;
  let nameFirstUrn: string;
  let metaFirstComponentUrn: string;
  let nameFirstComponentUrn: string;

  beforeAll(async () => {
    // Meta-first (legacy) path.
    const metaFirst = new CloudInfraBucket(
      new CloudInfraMeta({ name: 'assets', domain: 'au' })
    );
    // Name-first (v2 DX) path.
    const nameFirst = new CloudInfraBucket('assets', { domain: 'au' });

    metaFirstName = await outStr(metaFirst.getName());
    nameFirstName = await outStr(nameFirst.getName());

    metaFirstUrn = await urnOf(metaFirst.getBucket());
    nameFirstUrn = await urnOf(nameFirst.getBucket());
    metaFirstComponentUrn = await urnOf(metaFirst);
    nameFirstComponentUrn = await urnOf(nameFirst);
  });

  it('both register exactly two gcp.storage.Bucket children', () => {
    const buckets = captured.filter(r => r.type === T_BUCKET);
    expect(buckets.length).toBe(2);
  });

  it('the generated bucket NAME is identical (the F1 physical identity)', () => {
    // Both paths resolve through CloudInfraMeta → `p-assets-au` shape (prefix is
    // the mocked project `project`). The exact prefix is environment-derived;
    // the load-bearing assertion is that the two paths agree byte-for-byte.
    expect(nameFirstName).toBe(metaFirstName);
    expect(nameFirstName).toContain('assets');
  });

  it('the child Pulumi resource NAME captured by the mock is identical', () => {
    const buckets = captured.filter(r => r.type === T_BUCKET);
    expect(buckets[0].name).toBe(buckets[1].name);
  });

  it('the component + child URN are identical (the F2 migration identity)', () => {
    expect(nameFirstComponentUrn).toBe(metaFirstComponentUrn);
    expect(nameFirstUrn).toBe(metaFirstUrn);
    expect(nameFirstComponentUrn).toContain(BUCKET_TYPE);
  });
});

describe('DX1 — name-first Bucket honours a non-default NamingMode end-to-end', () => {
  it("naming: 'literal' === meta-first { omitPrefix, omitLocation } (name + URN)", async () => {
    // Exercises a non-conventional mode THROUGH the bucket constructor (not just
    // resolveMeta), proving the overload forwards `naming` into the meta.
    const metaFirst = new CloudInfraBucket(
      new CloudInfraMeta({
        name: 'static',
        domain: 'au',
        omitPrefix: true,
        omitLocation: true,
      })
    );
    const nameFirst = new CloudInfraBucket('static', {
      domain: 'au',
      naming: 'literal',
    });

    const mfName = await outStr(metaFirst.getName());
    const nfName = await outStr(nameFirst.getName());
    expect(nfName).toBe(mfName);
    // `literal` → bare `name`, so the bucket name is exactly "static".
    expect(nfName).toBe('static');

    expect(await urnOf(nameFirst)).toBe(await urnOf(metaFirst));
    expect(await urnOf(nameFirst.getBucket())).toBe(
      await urnOf(metaFirst.getBucket())
    );
  });
});
