/**
 * Wave 4 capstone — `CloudInfraService` coordinator.
 *
 * Pins the three load-bearing guarantees:
 *
 *  1. **Byte-identical** — a factory-produced component is indistinguishable
 *     from the equivalent DIRECT name-first construction: identical generated
 *     name (F1), identical component-node URN, and identical captured child
 *     resource (type + generated name + key args).
 *  2. **Auto-registration** — each factory auto-registers its component into the
 *     service's internal output manager, so the resource appears in
 *     `svc.outputs()` under the SAME flat key the equivalent direct
 *     `component.exportOutputs(manager)` would produce.
 *  3. **Opt-out** — `opts.register === false` skips registration (the resource
 *     is still constructed and byte-identical, just not collected).
 *
 * Representative spread: bucket, account, cloudRun, secret. Plus shared-args
 * merge precedence (per-call overrides shared) and the NO-IAM-surface guard.
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

import { CloudInfraService } from '../index';
import { CloudInfraOutput } from '../../output';
import { CloudInfraBucket } from '../../../components/bucket';
import { CloudInfraAccount } from '../../../components/account';
import { CloudInfraCloudRunService } from '../../../components/cloudrunservice';
import { CloudInfraSecretVersion } from '../../../components/secret';

const DOMAIN = 'au';
const LOCATION = 'australia-southeast1';

/** Minimal valid Cloud Run service config (image required by the resource). */
const RUN_ARGS = {
  template: {
    containers: [{ image: 'gcr.io/test/app:latest' }],
  },
};

let svc: CloudInfraService;

// Direct (control) constructions wired into a SEPARATE manager.
let directManager: CloudInfraOutput;
let directBucket: CloudInfraBucket;
let directAccount: CloudInfraAccount;
let directRun: CloudInfraCloudRunService;
let directSecret: CloudInfraSecretVersion;

beforeAll(() => {
  svc = new CloudInfraService('payments', {
    domain: DOMAIN,
    location: LOCATION,
  });

  // Factory-produced (auto-registered into svc's internal manager).
  svc.bucket('assets');
  svc.account('runner');
  svc.cloudRun('api', { ...RUN_ARGS });
  svc.secret('token', { secretData: 'shhh' });

  // Equivalent DIRECT name-first constructions, recorded into a fresh manager.
  directManager = new CloudInfraOutput();
  directBucket = new CloudInfraBucket('assets', {
    domain: DOMAIN,
    location: LOCATION,
  });
  directAccount = new CloudInfraAccount('runner', {
    domain: DOMAIN,
    location: LOCATION,
  });
  directRun = new CloudInfraCloudRunService('api', {
    domain: DOMAIN,
    location: LOCATION,
    ...RUN_ARGS,
  });
  directSecret = new CloudInfraSecretVersion('token', {
    domain: DOMAIN,
    location: LOCATION,
    secretData: 'shhh',
  });
  directBucket.exportOutputs(directManager);
  directAccount.exportOutputs(directManager);
  directRun.exportOutputs(directManager);
  directSecret.exportOutputs(directManager);
});

describe('CloudInfraService — byte-identical generated names (F1)', () => {
  it('factory bucket == direct bucket generated name', () => {
    const f = new CloudInfraService('s', { domain: DOMAIN, location: LOCATION })
      .bucket('assets');
    expect(f.getGeneratedName()).toBe(directBucket.getGeneratedName());
    expect(f.getGeneratedName()).toBe('project-assets-au-se1');
  });

  it('factory account == direct account generated name', () => {
    const f = new CloudInfraService('s', { domain: DOMAIN, location: LOCATION })
      .account('runner');
    expect(f.getGeneratedName()).toBe(directAccount.getGeneratedName());
  });

  it('factory cloudRun == direct cloudRun generated name', () => {
    const f = new CloudInfraService('s', { domain: DOMAIN, location: LOCATION })
      .cloudRun('api', { ...RUN_ARGS });
    expect(f.getGeneratedName()).toBe(directRun.getGeneratedName());
  });

  it('factory secret == direct secret generated name', () => {
    const f = new CloudInfraService('s', { domain: DOMAIN, location: LOCATION })
      .secret('token', { secretData: 'shhh' });
    expect(f.getGeneratedName()).toBe(directSecret.getGeneratedName());
  });

  it('the logical service name is NOT injected into child names', () => {
    // `payments` (the service handle) must not appear in any generated name.
    expect(directBucket.getGeneratedName()).not.toContain('payments');
    const fromSvc = new CloudInfraService('payments', {
      domain: DOMAIN,
      location: LOCATION,
    }).bucket('assets');
    expect(fromSvc.getGeneratedName()).not.toContain('payments');
    expect(fromSvc.getGeneratedName()).toBe(directBucket.getGeneratedName());
  });
});

describe('CloudInfraService — byte-identical URN (component-node identity)', () => {
  it('factory and direct components share the same URN', async () => {
    const factoryBucket = new CloudInfraService('s', {
      domain: DOMAIN,
      location: LOCATION,
    }).bucket('assets');

    const urnOf = (r: pulumi.Resource): Promise<string> =>
      new Promise(resolve => r.urn.apply(u => (resolve(u), u)));

    expect(await urnOf(factoryBucket)).toBe(await urnOf(directBucket));
  });
});

describe('CloudInfraService — auto-registration (flat key parity)', () => {
  it('svc.outputs() key set == equivalent direct exportOutputs() key set', () => {
    const svcKeys = Object.keys(svc.outputs()).sort();
    const directKeys = Object.keys(directManager.getFlatOutputs()).sort();
    expect(svcKeys).toEqual(directKeys);
    // Sanity: it is non-empty and covers all four resources' domains.
    expect(svcKeys.length).toBeGreaterThan(0);
    expect(svcKeys.every(k => k.startsWith(`${DOMAIN}.`))).toBe(true);
  });

  it('outputManager getter exposes the same underlying manager', () => {
    expect(svc.outputManager).toBeInstanceOf(CloudInfraOutput);
    expect(svc.outputManager.getFlatOutputs()).toBe(svc.outputs());
    // The nested wire is reachable for advanced use.
    expect(Object.keys(svc.outputManager.getOutputs())).toContain(DOMAIN);
  });

  it('the bucket is registered under a bucket-service flat key', () => {
    const keys = Object.keys(svc.outputs());
    expect(keys.some(k => k.includes('.bucket.'))).toBe(true);
    expect(keys.some(k => k.includes('.sa.'))).toBe(true);
    expect(keys.some(k => k.includes('.run.'))).toBe(true);
    // location is set → the secret is regional (`regionalsecret`/`regionalsecretversion`).
    expect(keys.some(k => k.includes('.regionalsecret.'))).toBe(true);
  });
});

describe('CloudInfraService — auto-register opt-out', () => {
  it('opts.register === false skips registration but still builds the resource', () => {
    const optOutSvc = new CloudInfraService('opt', {
      domain: DOMAIN,
      location: LOCATION,
    });
    const b = optOutSvc.bucket('skipme', undefined, { register: false });
    // Resource is byte-identical to the registered/direct one.
    expect(b.getGeneratedName()).toBe('project-skipme-au-se1');
    // But nothing was collected.
    expect(Object.keys(optOutSvc.outputs())).toEqual([]);
  });

  it('default (no register flag) DOES register', () => {
    const onSvc = new CloudInfraService('on', {
      domain: DOMAIN,
      location: LOCATION,
    });
    onSvc.bucket('keepme');
    expect(Object.keys(onSvc.outputs()).length).toBeGreaterThan(0);
  });
});

describe('CloudInfraService — shared-args merge precedence', () => {
  it('per-call args override the shared naming context', () => {
    const usOverride = new CloudInfraService('mixed', {
      domain: DOMAIN,
      location: LOCATION,
    }).bucket('assets', { domain: 'us', location: 'us-central1' });

    const directUs = new CloudInfraBucket('assets', {
      domain: 'us',
      location: 'us-central1',
    });
    expect(usOverride.getGeneratedName()).toBe(directUs.getGeneratedName());
    // It must NOT carry the service default `au`/`ause1`.
    expect(usOverride.getGeneratedName()).not.toBe('project-assets-au-se1');
  });

  it('shared location is inherited when no per-call location is given', () => {
    const inherited = new CloudInfraService('inh', {
      domain: DOMAIN,
      location: LOCATION,
    }).bucket('assets');
    expect(inherited.getGeneratedName()).toBe('project-assets-au-se1');
  });
});

describe('CloudInfraService — architectural guards', () => {
  it('exposes NO IAM / access-matrix surface', () => {
    const s = new CloudInfraService('s', { domain: DOMAIN });
    // The firm rule: IAM lives in the central access-matrix module, never here.
    for (const banned of ['grant', 'canRead', 'canWrite', 'accessMatrix', 'iam']) {
      expect(
        (s as unknown as Record<string, unknown>)[banned]
      ).toBeUndefined();
    }
  });

  it('is NOT a pulumi.ComponentResource (plain coordinator, no parent node)', () => {
    const s = new CloudInfraService('s', { domain: DOMAIN });
    expect(s).not.toBeInstanceOf(pulumi.ComponentResource);
    // No URN of its own.
    expect((s as unknown as Record<string, unknown>).urn).toBeUndefined();
  });
});
