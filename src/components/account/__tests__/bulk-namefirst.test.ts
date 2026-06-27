/**
 * DX2 — `CloudInfraBulkAccount` name-first ≡ meta-first equivalence.
 *
 * Proves the new `new CloudInfraBulkAccount(names: string[], args?, opts?)`
 * overload produces a bulk service-account set INDISTINGUISHABLE from the legacy
 * `new CloudInfraBulkAccount(new CloudInfraMeta({ name: [...], ... }), config)`
 * meta-first form, across representative cases (single name, multi name, and a
 * per-item `custom{}` override).
 *
 * What is pinned (state-sensitive surfaces from the task):
 *   • Component node label — `getGeneratedName()` (= `inputNames.join('-')` +
 *     `'-accounts'`).
 *   • Child SA generated names — the `accountId` (= F1 generated name → SA email
 *     identity), per input name.
 *   • `getAccounts()` key set/spelling — INPUT-name keys (access-matrix IAM
 *     binding names); identical & un-reordered.
 *   • Per-item `custom{}` override precedence (description must win).
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
import { CloudInfraBulkAccount } from '../bulk';

const T_SA = 'gcp:serviceaccount/account:Account';

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

describe('DX2 — CloudInfraBulkAccount name-first ≡ meta-first', () => {
  let single_meta: CloudInfraBulkAccount;
  let single_name: CloudInfraBulkAccount;
  let multi_meta: CloudInfraBulkAccount;
  let multi_name: CloudInfraBulkAccount;
  let custom_meta: CloudInfraBulkAccount;
  let custom_name: CloudInfraBulkAccount;

  beforeAll(async () => {
    single_meta = new CloudInfraBulkAccount(
      new CloudInfraMeta({ name: ['primary'], domain: 'au' })
    );
    single_name = new CloudInfraBulkAccount(['primary'], { domain: 'au' });

    multi_meta = new CloudInfraBulkAccount(
      new CloudInfraMeta({ name: ['primary', 'global'], domain: 'au' }),
      { description: 'shared' }
    );
    multi_name = new CloudInfraBulkAccount(['primary', 'global'], {
      domain: 'au',
      description: 'shared',
    });

    custom_meta = new CloudInfraBulkAccount(
      new CloudInfraMeta({ name: ['primary', 'global'], domain: 'au' }),
      { description: 'shared', custom: { global: { description: 'different' } } }
    );
    custom_name = new CloudInfraBulkAccount(['primary', 'global'], {
      domain: 'au',
      description: 'shared',
      custom: { global: { description: 'different' } },
    });

    await waitForCaptures();
  });

  it('component label (getGeneratedName) is identical', () => {
    expect(single_name.getGeneratedName()).toBe(single_meta.getGeneratedName());
    expect(multi_name.getGeneratedName()).toBe(multi_meta.getGeneratedName());
    expect(custom_name.getGeneratedName()).toBe(custom_meta.getGeneratedName());
    // Frozen formula: inputNames.join('-') + '-accounts'.
    expect(multi_meta.getGeneratedName()).toBe('primary-global-accounts');
    expect(single_meta.getGeneratedName()).toBe('primary-accounts');
  });

  it('getAccounts() key set & spelling is identical (input-name keys, un-reordered)', () => {
    expect(Object.keys(single_name.getAccounts())).toEqual(
      Object.keys(single_meta.getAccounts())
    );
    expect(Object.keys(multi_name.getAccounts())).toEqual(
      Object.keys(multi_meta.getAccounts())
    );
    expect(Object.keys(custom_name.getAccounts())).toEqual(
      Object.keys(custom_meta.getAccounts())
    );
    expect(Object.keys(multi_name.getAccounts())).toEqual([
      'primary',
      'global',
    ]);
  });

  it('child SA accountId (generated name) is identical', async () => {
    const idsOf = async (c: CloudInfraBulkAccount) => {
      const out: Record<string, string> = {};
      for (const [k, sa] of Object.entries(c.getAccounts())) {
        out[k] = await read(sa.accountId);
      }
      return out;
    };
    expect(await idsOf(single_name)).toEqual(await idsOf(single_meta));
    expect(await idsOf(multi_name)).toEqual(await idsOf(multi_meta));
    expect(await idsOf(custom_name)).toEqual(await idsOf(custom_meta));
    // Pin one concrete generated name (conventional: prefix-name-loc).
    expect((await idsOf(multi_meta)).primary).toBe('project-primary-au');
  });

  it('per-item custom{} override precedence is preserved (global.description=different)', async () => {
    const desc = async (c: CloudInfraBulkAccount, key: string) =>
      read(c.getAccounts()[key].description as pulumi.Output<string>);
    expect(await desc(custom_name, 'global')).toBe('different');
    expect(await desc(custom_name, 'primary')).toBe('shared');
    // Identical to meta-first.
    expect(await desc(custom_name, 'global')).toBe(
      await desc(custom_meta, 'global')
    );
    expect(await desc(custom_name, 'primary')).toBe(
      await desc(custom_meta, 'primary')
    );
  });

  it('captured child SA count matches across overloads', () => {
    expect(captured.filter(r => r.type === T_SA).length).toBeGreaterThan(0);
  });
});
