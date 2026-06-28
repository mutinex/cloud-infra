/**
 * W3-C — merged `CloudInfraBucket` (string | string[]) equivalence.
 *
 * Proves the merged class reproduces the EXACT pre-merge single AND bulk
 * behaviour, and that the `@deprecated` `CloudInfraBulkBucket` alias is
 * indistinguishable from the merged class's array arity.
 *
 * Pinned, state-sensitive surfaces:
 *   • Component node type-token + label/URN — single: `cloud-infra:bucket:Bucket`
 *     + `meta.getName()`; bulk: `cloud-infra:bucket:BulkBucket` +
 *     `Object.keys(names).sort().join('-')`.
 *   • Child resource generated names (F1) — the FIRST arg to each
 *     `gcp.storage.Bucket`, captured via `setMocks`.
 *   • `getBuckets()` key set/order — INPUT-name keys (access-matrix IAM names,
 *     Trap 6); identical & un-reordered.
 *   • Per-item `custom{}` override precedence.
 *   • Single no-arg accessors (`getBucket()`/`getName()`/`getUrl()`).
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

import { CloudInfraMeta } from '../../../core/meta';
import { CloudInfraBucket, BUCKET_TYPE, BUCKET_BULK_TYPE } from '../single';
import { CloudInfraBulkBucket, BULK_BUCKET_TYPE } from '../bulk';

const T_BUCKET = 'gcp:storage/bucket:Bucket';

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

async function namesOf(c: CloudInfraBucket): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, b] of Object.entries(c.getBuckets())) {
    out[k] = await read(b.name);
  }
  return out;
}

describe('W3-C — merged CloudInfraBucket single/bulk/alias equivalence', () => {
  let single_name: CloudInfraBucket;
  let single_meta: CloudInfraBucket;
  let merged_arr: CloudInfraBucket;
  let merged_meta_arr: CloudInfraBucket;
  let alias_arr: CloudInfraBulkBucket;
  let alias_meta_arr: CloudInfraBulkBucket;
  let custom_merged: CloudInfraBucket;
  let custom_alias: CloudInfraBulkBucket;

  beforeAll(async () => {
    // Single arity (string + meta-first single).
    single_name = new CloudInfraBucket('assets', { domain: 'au' });
    single_meta = new CloudInfraBucket(
      new CloudInfraMeta({ name: 'assets', domain: 'au' })
    );

    // Bulk arity via the merged class (array name-first + meta-first array).
    merged_arr = new CloudInfraBucket(['assets', 'logs'], { domain: 'au' });
    merged_meta_arr = new CloudInfraBucket(
      new CloudInfraMeta({ name: ['assets', 'logs'], domain: 'au' })
    );

    // Bulk arity via the deprecated alias (array + meta-first array).
    alias_arr = new CloudInfraBulkBucket(['assets', 'logs'], { domain: 'au' });
    alias_meta_arr = new CloudInfraBulkBucket(
      new CloudInfraMeta({ name: ['assets', 'logs'], domain: 'au' })
    );

    // Custom precedence — merged class vs alias.
    custom_merged = new CloudInfraBucket(['assets', 'logs'], {
      domain: 'au',
      forceDestroy: false,
      custom: { logs: { forceDestroy: true } },
    });
    custom_alias = new CloudInfraBulkBucket(['assets', 'logs'], {
      domain: 'au',
      forceDestroy: false,
      custom: { logs: { forceDestroy: true } },
    });

    await waitForCaptures();
  });

  it('type tokens & alias re-export are byte-identical', () => {
    expect(BUCKET_TYPE).toBe('cloud-infra:bucket:Bucket');
    expect(BUCKET_BULK_TYPE).toBe('cloud-infra:bucket:BulkBucket');
    expect(BULK_BUCKET_TYPE).toBe(BUCKET_BULK_TYPE);
  });

  it('single component label == meta.getName() (string ≡ meta-first single)', () => {
    expect(single_name.getGeneratedName()).toBe('project-assets-au');
    expect(single_meta.getGeneratedName()).toBe('project-assets-au');
  });

  it('bulk component label == sorted-keys-join (merged ≡ alias)', () => {
    expect(merged_arr.getGeneratedName()).toBe('assets-logs');
    expect(merged_meta_arr.getGeneratedName()).toBe('assets-logs');
    expect(alias_arr.getGeneratedName()).toBe('assets-logs');
    expect(alias_meta_arr.getGeneratedName()).toBe('assets-logs');
  });

  it('single getBuckets() is keyed by input name with one entry', () => {
    expect(Object.keys(single_name.getBuckets())).toEqual(['assets']);
    expect(Object.keys(single_meta.getBuckets())).toEqual(['assets']);
  });

  it('bulk getBuckets() key set & order identical across merged & alias', () => {
    const expected = ['assets', 'logs'];
    expect(Object.keys(merged_arr.getBuckets())).toEqual(expected);
    expect(Object.keys(merged_meta_arr.getBuckets())).toEqual(expected);
    expect(Object.keys(alias_arr.getBuckets())).toEqual(expected);
    expect(Object.keys(alias_meta_arr.getBuckets())).toEqual(expected);
  });

  it('single child generated name is byte-identical (F1)', async () => {
    expect(await namesOf(single_name)).toEqual({ assets: 'project-assets-au' });
    expect(await namesOf(single_meta)).toEqual(await namesOf(single_name));
    // No-arg single accessor returns the same name.
    expect(await read(single_name.getName())).toBe('project-assets-au');
  });

  it('bulk child generated names byte-identical across merged & alias', async () => {
    const expected = {
      assets: 'project-assets-au',
      logs: 'project-logs-au',
    };
    expect(await namesOf(merged_arr)).toEqual(expected);
    expect(await namesOf(merged_meta_arr)).toEqual(expected);
    expect(await namesOf(alias_arr)).toEqual(expected);
    expect(await namesOf(alias_meta_arr)).toEqual(expected);
  });

  it('single no-arg getBucket() returns the lone Bucket', () => {
    expect(single_name.getBucket()).toBe(
      single_name.getBuckets().assets
    );
  });

  it('per-item custom{} precedence identical (merged ≡ alias)', async () => {
    const fd = (c: CloudInfraBucket, key: string) =>
      read(c.getBuckets()[key].forceDestroy as pulumi.Output<boolean>);
    expect(await fd(custom_merged, 'logs')).toBe(true);
    expect(await fd(custom_merged, 'assets')).toBe(false);
    expect(await fd(custom_alias, 'logs')).toBe(true);
    expect(await fd(custom_alias, 'assets')).toBe(false);
  });

  it('bulk no-arg single accessor throws (clear DX error)', () => {
    expect(() => merged_arr.getBucket()).toThrow();
  });

  it('child bucket resources were captured', () => {
    expect(captured.filter(r => r.type === T_BUCKET).length).toBeGreaterThan(0);
  });
});
