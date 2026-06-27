/**
 * Frozen Contract F2 — CloudInfraAlb child type tokens + bare-name reuse.
 *
 * See `docs/v2-redesign-notes.md` §2 (F2). The ALB component wraps a set of GCP
 * children that were historically created FLAT at the stack root. v2 re-parents
 * them under the component but MUST keep two things byte-identical so existing
 * deployments migrate in-place (alias) rather than destroy/recreate:
 *
 *   1. Each child's Pulumi `__pulumiType` token (the resource KIND in its URN).
 *   2. The child's logical NAME — every child reuses the BARE `meta.getName()`
 *      (alb/index.ts:153,196-202 thread one `resourceName` into all children),
 *      so the same name is shared across all child types (F2 bare-name reuse).
 *
 * This file pins all 12 child type tokens across BOTH paths and asserts the
 * bare name on every child's first constructor arg, mirroring the
 * `pulumi.runtime.setMocks` capture style in
 * `f2-cloudrunservice.golden.test.ts`.
 *
 *   Global path  (domain 'gl'):
 *     GlobalAddress, URLMap, TargetHttpsProxy / TargetHttpProxy,
 *     SSLCertificate, GlobalForwardingRule
 *   Regional path (domain 'au'):
 *     Address, RegionUrlMap, RegionTargetHttpsProxy / RegionTargetHttpProxy,
 *     RegionSslCertificate, ForwardingRule
 *
 * HTTPS vs HTTP proxy selection is driven by whether `target.sslCertificates`
 * is a config object (→ creates an SSL cert + HTTPS proxy) or absent (→ HTTP
 * proxy, no cert). All four combinations are instantiated to cover all 12
 * tokens. Deterministic (no Date.now/random); name is context-free via an
 * explicit `prefix` + `gcpProject`.
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
        // selfLink is read by the proxy resolver (`p.selfLink`); provide one so
        // the downstream `.apply` resolves.
        state: {
          ...args.inputs,
          name: args.inputs.name ?? args.name,
          selfLink: `https://self/${args.name}`,
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
import { CloudInfraAlb, CLOUD_INFRA_ALB_TYPE } from '../../../components/alb';

// ── Frozen child type tokens ────────────────────────────────────────────────
const T = {
  GlobalAddress: 'gcp:compute/globalAddress:GlobalAddress',
  Address: 'gcp:compute/address:Address',
  URLMap: 'gcp:compute/uRLMap:URLMap',
  RegionUrlMap: 'gcp:compute/regionUrlMap:RegionUrlMap',
  TargetHttpsProxy: 'gcp:compute/targetHttpsProxy:TargetHttpsProxy',
  TargetHttpProxy: 'gcp:compute/targetHttpProxy:TargetHttpProxy',
  RegionTargetHttpsProxy:
    'gcp:compute/regionTargetHttpsProxy:RegionTargetHttpsProxy',
  RegionTargetHttpProxy:
    'gcp:compute/regionTargetHttpProxy:RegionTargetHttpProxy',
  SSLCertificate: 'gcp:compute/sSLCertificate:SSLCertificate',
  RegionSslCertificate: 'gcp:compute/regionSslCertificate:RegionSslCertificate',
  GlobalForwardingRule: 'gcp:compute/globalForwardingRule:GlobalForwardingRule',
  ForwardingRule: 'gcp:compute/forwardingRule:ForwardingRule',
} as const;

const PREFIX = 'p';
const GCP = 'test-project';

function meta(name: string, domain: string): CloudInfraMeta {
  return new CloudInfraMeta({
    name,
    domain,
    prefix: PREFIX,
    gcpProject: GCP,
  } as never);
}

const httpsTarget = {
  sslCertificates: { certificate: 'cert-pem', privateKey: 'key-pem' },
  urlMap: { defaultService: 'https://self/backend' },
};
const httpTarget = {
  urlMap: { defaultService: 'https://self/backend' },
};

/**
 * Wait until at least `min` resources have registered AND the count has been
 * stable across several consecutive polls. The four ALB instances register
 * their children asynchronously and interleaved, so a single equal-poll check
 * can catch a transient mid-registration plateau — require sustained quiescence.
 */
async function waitForCaptures(min: number): Promise<void> {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now === last) {
      stable += 1;
      if (now >= min && stable >= 5) return;
    } else {
      stable = 0;
    }
    last = now;
  }
}

function tokensWithName(expectedName: string): Set<string> {
  return new Set(
    captured.filter(r => r.name === expectedName).map(r => r.type)
  );
}

// Expected bare names: meta.getName() reuses prefix-name-loc.
const GLOBAL_NAME = 'p-lb-gl';
const REGIONAL_NAME = 'p-rlb-au';

describe('F2/ALB — 12 child type tokens + bare-name reuse', () => {
  beforeAll(async () => {
    // Global HTTPS (covers GlobalAddress, URLMap, TargetHttpsProxy,
    // SSLCertificate, GlobalForwardingRule).
    new CloudInfraAlb(meta('lb', 'gl'), {
      target: httpsTarget,
      portRange: '443',
    });
    // Global HTTP (covers TargetHttpProxy).
    new CloudInfraAlb(meta('lb-http', 'gl'), {
      target: httpTarget,
      portRange: '80',
    });
    // Regional HTTPS (covers Address, RegionUrlMap, RegionTargetHttpsProxy,
    // RegionSslCertificate, ForwardingRule).
    new CloudInfraAlb(meta('rlb', 'au'), {
      target: httpsTarget,
      portRange: '443',
    });
    // Regional HTTP (covers RegionTargetHttpProxy).
    new CloudInfraAlb(meta('rlb-http', 'au'), {
      target: httpTarget,
      portRange: '80',
    });
    // 4 component nodes + 18 children (HTTPS paths: 5 each; HTTP paths: 4 each).
    await waitForCaptures(22);
  });

  it('all expected resources registered (fail-fast on a missing child)', () => {
    // 4 component nodes + 18 children. If a future change drops a child (e.g. the
    // SSL cert stops being created), the count falls short here and gives a clear
    // signal instead of relying on a downstream token check after a wait timeout.
    expect(captured.length).toBe(22);
  });

  it('component type token is the frozen `cloud-infra:alb:CloudInfraAlb`', () => {
    expect(CLOUD_INFRA_ALB_TYPE).toBe('cloud-infra:alb:CloudInfraAlb');
  });

  it('GLOBAL HTTPS path registers its 5 child tokens (incl. SSLCertificate + HTTPS proxy)', () => {
    const types = tokensWithName(GLOBAL_NAME);
    expect(types.has(T.GlobalAddress)).toBe(true);
    expect(types.has(T.URLMap)).toBe(true);
    expect(types.has(T.TargetHttpsProxy)).toBe(true);
    expect(types.has(T.SSLCertificate)).toBe(true);
    expect(types.has(T.GlobalForwardingRule)).toBe(true);
  });

  it('GLOBAL HTTP path registers the TargetHttpProxy token (no cert)', () => {
    const types = tokensWithName('p-lb-http-gl');
    expect(types.has(T.TargetHttpProxy)).toBe(true);
    expect(types.has(T.SSLCertificate)).toBe(false);
    expect(types.has(T.GlobalAddress)).toBe(true);
    expect(types.has(T.URLMap)).toBe(true);
    expect(types.has(T.GlobalForwardingRule)).toBe(true);
  });

  it('REGIONAL HTTPS path registers its 5 child tokens (incl. RegionSslCertificate + HTTPS proxy)', () => {
    const types = tokensWithName(REGIONAL_NAME);
    expect(types.has(T.Address)).toBe(true);
    expect(types.has(T.RegionUrlMap)).toBe(true);
    expect(types.has(T.RegionTargetHttpsProxy)).toBe(true);
    expect(types.has(T.RegionSslCertificate)).toBe(true);
    expect(types.has(T.ForwardingRule)).toBe(true);
  });

  it('REGIONAL HTTP path registers the RegionTargetHttpProxy token (no cert)', () => {
    const types = tokensWithName('p-rlb-http-au');
    expect(types.has(T.RegionTargetHttpProxy)).toBe(true);
    expect(types.has(T.RegionSslCertificate)).toBe(false);
    expect(types.has(T.Address)).toBe(true);
    expect(types.has(T.RegionUrlMap)).toBe(true);
    expect(types.has(T.ForwardingRule)).toBe(true);
  });

  it('every captured ALB child reuses the BARE meta.getName() as its first-arg name (F2)', () => {
    // For each ALB instance, EVERY gcp child it registers carries the bare
    // generated component name — no per-child suffix. (The component NODE itself
    // also registers under the same bare name; filter to the gcp children.)
    const globalChildren = captured.filter(
      r => r.name === GLOBAL_NAME && r.type.startsWith('gcp:compute/')
    );
    // 5 children: address, urlMap, cert, proxy, forwardingRule.
    expect(globalChildren.length).toBe(5);
    for (const child of globalChildren) {
      expect(child.name).toBe(GLOBAL_NAME);
    }
    // The ALB component node also stamps the bare name (it is the `super()` name).
    const componentNode = captured.find(
      r => r.name === GLOBAL_NAME && r.type === CLOUD_INFRA_ALB_TYPE
    );
    expect(componentNode).toBeDefined();
  });

  it('all 12 distinct child type tokens are observed across the two paths', () => {
    const allTypes = new Set(captured.map(r => r.type));
    for (const token of Object.values(T)) {
      expect(allTypes.has(token)).toBe(true);
    }
  });
});
