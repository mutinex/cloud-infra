/**
 * WS-C Task 1 — `CloudInfraTag` name-first ≡ meta-first equivalence.
 *
 * Proves the new `new CloudInfraTag(name, args, opts?)` overload produces a
 * TagKey + TagValues set INDISTINGUISHABLE from the legacy meta-first
 * `new CloudInfraTag(new CloudInfraMeta({ name, ... }), config)` form.
 *
 * NB: `CloudInfraTag`'s config is REQUIRED (carries the mandatory `values`), so
 * the name-first `args` is a required parameter — this is preserved.
 *
 * Pinned (state-sensitive surfaces): component label `getGeneratedName()`, the
 * TagKey's `shortName` (= input name, the GCP identity), the TagValue
 * `shortName`s (RAW, NOT meta-derived — F1/F2), the resolved `parent`, and the
 * captured Pulumi resource names.
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
import { CloudInfraTag } from '../index';

const T_TAGKEY = 'gcp:tags/tagKey:TagKey';
const T_TAGVALUE = 'gcp:tags/tagValue:TagValue';

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

const values = [
  { shortName: 'eng', description: 'Engineering' },
  { shortName: 'ops', description: 'Operations' },
];

describe('WS-C Task 1 — CloudInfraTag name-first ≡ meta-first', () => {
  let meta_tag: CloudInfraTag;
  let name_tag: CloudInfraTag;

  beforeAll(async () => {
    meta_tag = new CloudInfraTag(
      new CloudInfraMeta({ name: 'costcenter', domain: 'gl' }),
      { parent: 'organizations/123', values }
    );
    name_tag = new CloudInfraTag('costcenter', {
      domain: 'gl',
      parent: 'organizations/123',
      values,
    });
    await waitForCaptures();
  });

  it('component label (getGeneratedName) is identical', () => {
    expect(name_tag.getGeneratedName()).toBe(meta_tag.getGeneratedName());
    // conventional formula: prefix-name-loc.
    expect(meta_tag.getGeneratedName()).toBe('project-costcenter-gl');
  });

  it('TagKey shortName (input name → GCP identity) + parent are identical', async () => {
    const keys = captured.filter(r => r.type === T_TAGKEY);
    // One TagKey per construction (2 total).
    expect(keys.length).toBe(2);
    const shortNames = keys.map(k => k.inputs.shortName);
    expect(shortNames).toEqual(['costcenter', 'costcenter']);
    const parents = keys.map(k => k.inputs.parent);
    expect(parents).toEqual(['organizations/123', 'organizations/123']);
  });

  it('TagValue shortNames (RAW, NOT meta-derived — F1/F2) are identical', () => {
    const vals = captured
      .filter(r => r.type === T_TAGVALUE)
      .map(r => r.inputs.shortName);
    // 2 values per construction (eng, ops) × 2 constructions.
    expect(vals.sort()).toEqual(['eng', 'eng', 'ops', 'ops']);
  });

  it('captured TagKey resource names match across overloads', () => {
    const keyNames = captured.filter(r => r.type === T_TAGKEY).map(r => r.name);
    expect(keyNames.filter(n => n === 'project-costcenter-gl').length).toBe(2);
  });
});
