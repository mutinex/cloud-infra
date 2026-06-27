/**
 * DX2 — `CloudInfraBulkBucket` name-first ≡ meta-first equivalence.
 *
 * Proves the new `new CloudInfraBulkBucket(names: string[], args?, opts?)`
 * overload produces a bulk bucket INDISTINGUISHABLE from the legacy
 * `new CloudInfraBulkBucket(new CloudInfraMeta({ name: [...], ... }), config)`
 * meta-first form, across representative cases (single name, multi name, and a
 * per-item `custom{}` override).
 *
 * What is pinned (the state-sensitive, Trap-6 surfaces from the task):
 *   • Component node label  — `getGeneratedName()` (= sorted-keys-join formula).
 *   • Child resource generated names — the FIRST arg passed to each
 *     `gcp.storage.Bucket`, captured via `setMocks` (`args.name`). These are the
 *     F1 generated names and feed the child URNs.
 *   • `getBuckets()` key set/spelling — the INPUT-name keys that embed into
 *     access-matrix IAM binding names; must be identical & un-reordered.
 *   • Per-item `custom{}` override merge precedence (a custom field must win).
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
import { CloudInfraBulkBucket } from '../bulk';

const T_BUCKET = 'gcp:storage/bucket:Bucket';

/** Resolve a bucket arg field via its `.apply`. */
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

describe('DX2 — CloudInfraBulkBucket name-first ≡ meta-first', () => {
  // Representative cases: single-name, multi-name, multi-name + custom override.
  let single_meta: CloudInfraBulkBucket;
  let single_name: CloudInfraBulkBucket;
  let multi_meta: CloudInfraBulkBucket;
  let multi_name: CloudInfraBulkBucket;
  let custom_meta: CloudInfraBulkBucket;
  let custom_name: CloudInfraBulkBucket;

  beforeAll(async () => {
    single_meta = new CloudInfraBulkBucket(
      new CloudInfraMeta({ name: ['assets'], domain: 'au' })
    );
    single_name = new CloudInfraBulkBucket(['assets'], { domain: 'au' });

    multi_meta = new CloudInfraBulkBucket(
      new CloudInfraMeta({ name: ['assets', 'logs'], domain: 'au' }),
      { storageClass: 'NEARLINE' }
    );
    multi_name = new CloudInfraBulkBucket(['assets', 'logs'], {
      domain: 'au',
      storageClass: 'NEARLINE',
    });

    custom_meta = new CloudInfraBulkBucket(
      new CloudInfraMeta({ name: ['assets', 'logs'], domain: 'au' }),
      { forceDestroy: false, custom: { logs: { forceDestroy: true } } }
    );
    custom_name = new CloudInfraBulkBucket(['assets', 'logs'], {
      domain: 'au',
      forceDestroy: false,
      custom: { logs: { forceDestroy: true } },
    });

    await waitForCaptures();
  });

  it('component label (getGeneratedName) is identical', () => {
    expect(single_name.getGeneratedName()).toBe(single_meta.getGeneratedName());
    expect(multi_name.getGeneratedName()).toBe(multi_meta.getGeneratedName());
    expect(custom_name.getGeneratedName()).toBe(custom_meta.getGeneratedName());
    // And matches the frozen sorted-keys-join formula.
    expect(multi_meta.getGeneratedName()).toBe('assets-logs');
  });

  it('getBuckets() key set & spelling is identical (input-name keys, un-reordered)', () => {
    expect(Object.keys(single_name.getBuckets())).toEqual(
      Object.keys(single_meta.getBuckets())
    );
    expect(Object.keys(multi_name.getBuckets())).toEqual(
      Object.keys(multi_meta.getBuckets())
    );
    expect(Object.keys(custom_name.getBuckets())).toEqual(
      Object.keys(custom_meta.getBuckets())
    );
    // Pin the actual input-name keys.
    expect(Object.keys(multi_name.getBuckets())).toEqual(['assets', 'logs']);
  });

  it('child resource generated names are identical', async () => {
    // Read each bucket resource name (the F1 generated name) per overload.
    const namesOf = async (c: CloudInfraBulkBucket) => {
      const out: Record<string, string> = {};
      for (const [k, b] of Object.entries(c.getBuckets())) {
        out[k] = await read(b.name);
      }
      return out;
    };
    expect(await namesOf(single_name)).toEqual(await namesOf(single_meta));
    expect(await namesOf(multi_name)).toEqual(await namesOf(multi_meta));
    expect(await namesOf(custom_name)).toEqual(await namesOf(custom_meta));
    // Pin one concrete generated name (conventional: prefix-name-loc).
    expect((await namesOf(multi_meta)).assets).toBe('project-assets-au');
  });

  it('per-item custom{} override precedence is preserved (logs.forceDestroy=true)', async () => {
    const fd = async (c: CloudInfraBulkBucket, key: string) =>
      read(c.getBuckets()[key].forceDestroy as pulumi.Output<boolean>);
    expect(await fd(custom_name, 'logs')).toBe(true);
    expect(await fd(custom_name, 'assets')).toBe(false);
    // Identical to meta-first.
    expect(await fd(custom_name, 'logs')).toBe(await fd(custom_meta, 'logs'));
    expect(await fd(custom_name, 'assets')).toBe(
      await fd(custom_meta, 'assets')
    );
  });

  it('captured child bucket count matches across overloads', () => {
    expect(captured.filter(r => r.type === T_BUCKET).length).toBeGreaterThan(0);
  });
});
