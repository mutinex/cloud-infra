/**
 * W3-C — merged `CloudInfraAccount` (string | string[]) equivalence.
 *
 * Proves the merged class reproduces the EXACT pre-merge single AND bulk
 * behaviour, and that the `@deprecated` `CloudInfraBulkAccount` alias is
 * indistinguishable from the merged class's array arity.
 *
 * Pinned, state-sensitive surfaces:
 *   • Component node type-token + label/URN — single:
 *     `cloud-infra:account:CloudInfraAccount` + `meta.getName()`; bulk:
 *     `cloud-infra:account:CloudInfraBulkAccount` +
 *     `inputNames.join('-').concat('-accounts')`.
 *   • Child SA generated name == `accountId` == SA email identity (F1).
 *   • `getAccounts()` key set/order — INPUT-name keys (access-matrix IAM names,
 *     Trap 6); identical & un-reordered.
 *   • Per-item `custom{}` override precedence.
 *   • Frozen single public field `serviceAccount` + no-arg single accessors.
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
import {
  CloudInfraAccount,
  ACCOUNT_TYPE,
  ACCOUNT_BULK_TYPE,
} from '../single';
import { CloudInfraBulkAccount, BULK_ACCOUNT_TYPE } from '../bulk';
import { PrincipalFactory } from '../../../core/access-matrix/principals/principal-factory';
import { ResourcePrincipalResolver } from '../../../core/access-matrix/principals/principal-types';
import { ValidationError } from '../../../core/errors';

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

async function idsOf(c: CloudInfraAccount): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, sa] of Object.entries(c.getAccounts())) {
    out[k] = await read(sa.accountId);
  }
  return out;
}

describe('W3-C — merged CloudInfraAccount single/bulk/alias equivalence', () => {
  let single_name: CloudInfraAccount;
  let single_meta: CloudInfraAccount;
  let merged_arr: CloudInfraAccount;
  let merged_meta_arr: CloudInfraAccount;
  let alias_arr: CloudInfraBulkAccount;
  let alias_meta_arr: CloudInfraBulkAccount;
  let custom_merged: CloudInfraAccount;
  let custom_alias: CloudInfraBulkAccount;
  let reverse_sorted: CloudInfraAccount;

  beforeAll(async () => {
    single_name = new CloudInfraAccount('app', { domain: 'au' });
    single_meta = new CloudInfraAccount(
      new CloudInfraMeta({ name: 'app', domain: 'au' })
    );

    merged_arr = new CloudInfraAccount(['primary', 'global'], { domain: 'au' });
    merged_meta_arr = new CloudInfraAccount(
      new CloudInfraMeta({ name: ['primary', 'global'], domain: 'au' })
    );

    alias_arr = new CloudInfraBulkAccount(['primary', 'global'], {
      domain: 'au',
    });
    alias_meta_arr = new CloudInfraBulkAccount(
      new CloudInfraMeta({ name: ['primary', 'global'], domain: 'au' })
    );

    custom_merged = new CloudInfraAccount(['primary', 'global'], {
      domain: 'au',
      description: 'shared',
      custom: { global: { description: 'different' } },
    });
    custom_alias = new CloudInfraBulkAccount(['primary', 'global'], {
      domain: 'au',
      description: 'shared',
      custom: { global: { description: 'different' } },
    });

    // Reverse-sorted inputs to pin the account label join order (INSERTION, not
    // sorted — the frozen asymmetry vs CloudInfraBucket which sorts).
    reverse_sorted = new CloudInfraAccount(['global', 'primary'], {
      domain: 'au',
    });

    await waitForCaptures();
  });

  it('type tokens & alias re-export are byte-identical', () => {
    expect(ACCOUNT_TYPE).toBe('cloud-infra:account:CloudInfraAccount');
    expect(ACCOUNT_BULK_TYPE).toBe('cloud-infra:account:CloudInfraBulkAccount');
    expect(BULK_ACCOUNT_TYPE).toBe(ACCOUNT_BULK_TYPE);
  });

  it('single component label == meta.getName()', () => {
    expect(single_name.getGeneratedName()).toBe('project-app-au');
    expect(single_meta.getGeneratedName()).toBe('project-app-au');
  });

  it('bulk component label == inputNames.join("-")+"-accounts" (merged ≡ alias)', () => {
    expect(merged_arr.getGeneratedName()).toBe('primary-global-accounts');
    expect(merged_meta_arr.getGeneratedName()).toBe('primary-global-accounts');
    expect(alias_arr.getGeneratedName()).toBe('primary-global-accounts');
    expect(alias_meta_arr.getGeneratedName()).toBe('primary-global-accounts');
  });

  it('bulk getAccounts() key set & order identical across merged & alias', () => {
    const expected = ['primary', 'global'];
    expect(Object.keys(merged_arr.getAccounts())).toEqual(expected);
    expect(Object.keys(merged_meta_arr.getAccounts())).toEqual(expected);
    expect(Object.keys(alias_arr.getAccounts())).toEqual(expected);
    expect(Object.keys(alias_meta_arr.getAccounts())).toEqual(expected);
  });

  it('single child accountId is byte-identical (F1 → email identity)', async () => {
    expect(await idsOf(single_name)).toEqual({ app: 'project-app-au' });
    expect(await idsOf(single_meta)).toEqual(await idsOf(single_name));
    // Frozen public field + no-arg accessors operate on the single account.
    expect(single_name.serviceAccount).toBe(single_name.getServiceAccount());
    expect(await read(single_name.getServiceAccount().accountId)).toBe(
      'project-app-au'
    );
  });

  it('bulk child accountIds byte-identical across merged & alias', async () => {
    const expected = {
      primary: 'project-primary-au',
      global: 'project-global-au',
    };
    expect(await idsOf(merged_arr)).toEqual(expected);
    expect(await idsOf(merged_meta_arr)).toEqual(expected);
    expect(await idsOf(alias_arr)).toEqual(expected);
    expect(await idsOf(alias_meta_arr)).toEqual(expected);
  });

  it('per-item custom{} precedence identical (merged ≡ alias)', async () => {
    const desc = (c: CloudInfraAccount, key: string) =>
      read(c.getAccounts()[key].description as pulumi.Output<string>);
    expect(await desc(custom_merged, 'global')).toBe('different');
    expect(await desc(custom_merged, 'primary')).toBe('shared');
    expect(await desc(custom_alias, 'global')).toBe('different');
    expect(await desc(custom_alias, 'primary')).toBe('shared');
  });

  it('single membership surface (emails/ids/members) keyed by input name', () => {
    expect(Object.keys(single_name.emails)).toEqual(['app']);
    expect(Object.keys(single_name.serviceAccounts)).toEqual(['app']);
  });

  it('bulk component label preserves INSERTION join order (not sorted) — frozen asymmetry', () => {
    // Account joins input names in INSERTION order then appends '-accounts';
    // ['global','primary'] → 'global-primary-accounts'. (Contrast: bucket SORTS
    // its keys — ['logs','assets'] → 'assets-logs'.) Pinning this asymmetry
    // guards the frozen component-node label/URN.
    expect(reverse_sorted.getGeneratedName()).toBe('global-primary-accounts');
    expect(Object.keys(reverse_sorted.getAccounts())).toEqual([
      'global',
      'primary',
    ]);
  });

  it('bulk no-arg single accessor throws a ValidationError (op/message), not just any error', () => {
    expect(() => merged_arr.getServiceAccount()).toThrow(ValidationError);
    try {
      merged_arr.getServiceAccount();
      throw new Error('expected getServiceAccount() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.component).toBe('account');
      expect(ve.operation).toBe('getServiceAccount');
      expect(ve.message).toContain('getServiceAccount');
      expect(ve.message).toContain('bulk');
    }
  });

  it('alias getIamMembers() returns the record shape', () => {
    expect(alias_arr.getIamMembers()).toEqual({});
  });

  it('child SA resources were captured', () => {
    expect(captured.filter(r => r.type === T_SA).length).toBeGreaterThan(0);
  });

  // ── Trap 6 / access-matrix principal-expansion gate (fix #4) ─────────────
  //
  // The merged single CloudInfraAccount now ALSO exposes getAccounts() (a
  // single-entry record). expandPrincipals USED to duck-type getAccounts() and
  // would have expanded a SINGLE account into its raw child SA. The gate now
  // expands ONLY on genuine bulk-ness (explicit isCloudInfraBulkResource marker
  // OR >1 contained account), so a single account resolves via the WRAPPER path,
  // exactly as before the single class gained getAccounts().
  it('single account is NOT expanded → resolves via the wrapper (byte-identical member + identifier)', async () => {
    const resolver = new ResourcePrincipalResolver();

    // Gate keeps the single account un-expanded: expansion returns the WRAPPER
    // itself (reference-identical), NOT its child gcp.serviceaccount.Account.
    const expanded = PrincipalFactory.expandPrincipals([single_name]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toBe(single_name);
    expect(single_name.isCloudInfraBulkResource).toBe(false);

    // The wrapper resolves to the frozen single member + identifier (Trap 6).
    const wrapperResolved = resolver.resolve(single_name as never, 0);
    expect(wrapperResolved.identifier).toBe('project-app-au');
    const member = await read(wrapperResolved.member as pulumi.Output<string>);
    expect(member.startsWith('serviceAccount:')).toBe(true);
  });

  it('multi-account bulk IS expanded to its child accounts (unchanged)', () => {
    // merged_arr = ['primary','global'] → expands to its two child SAs, in
    // input-name (getAccounts) key order, exactly as before the gate.
    expect(merged_arr.isCloudInfraBulkResource).toBe(true);
    const expanded = PrincipalFactory.expandPrincipals([merged_arr]);
    const children = Object.values(merged_arr.getAccounts());
    expect(expanded).toHaveLength(2);
    expect(expanded).toEqual(children);
  });
});
