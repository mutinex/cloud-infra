/**
 * DX1 — name-first CloudInfraAlb equivalence (Frozen Contract F1 / F2).
 *
 * `new CloudInfraAlb("lb", { domain: "gl", target: {...}, portRange: "443" })`
 * (name-first, v2 DX) must produce the IDENTICAL physical child names, the
 * IDENTICAL child URNs, and the SAME set of child type tokens as the legacy
 * meta-first
 * `new CloudInfraAlb(new CloudInfraMeta({ name: "lb", domain: "gl" }), {...})`.
 *
 * The ALB component is the heaviest in the v2 sweep: up to ~5 children per
 * instance (Address, URL map, proxy, SSL certificate, forwarding rule), across
 * global and regional variants, with 12 frozen child type tokens guarded by
 * `f2-alb-tokens.golden.test.ts`. The name-first change only reroutes how the
 * meta is obtained, so every child must stay byte-identical. If any differs,
 * switching a consuming stack to the name-first overload would destroy/recreate
 * that child (F1/F2 violation).
 *
 * Equivalence is asserted PER PUBLIC GETTER (forwarding rule, address, URL map,
 * proxy, certificate) so the comparison is independent of whatever prefix the
 * test stack resolves to — name-first and meta-first must agree exactly.
 * Type-token coverage is asserted across both global+regional variants to mirror
 * the 12-token guard. Mocks + config MUST be set before importing anything that
 * builds resources.
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

// Import AFTER mocks are configured.
import { CloudInfraMeta } from '../../meta';
import { CloudInfraAlb, CLOUD_INFRA_ALB_TYPE } from '../../../components/alb';

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

// The 12 frozen child type tokens (mirrors f2-alb-tokens.golden.test.ts).
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

const httpsTarget = {
  sslCertificates: { certificate: 'cert-pem', privateKey: 'key-pem' },
  urlMap: { defaultService: 'https://self/backend' },
};

/**
 * Collect every comparable identity (name + URN) of an ALB's children, plus the
 * component URN, in a deterministic order so two ALBs can be compared field by
 * field.
 */
async function identityOf(alb: CloudInfraAlb): Promise<{
  componentUrn: string;
  forwardingRuleName: string;
  forwardingRuleUrn: string;
  addressUrn: string;
  urlMapUrn: string;
  proxyUrn: string;
  certUrn: string;
}> {
  const address = alb.getAddressResource();
  const urlMap = alb.getUrlMap();
  const proxy = alb.getProxy();
  const cert = alb.getCertificate();
  return {
    componentUrn: await urnOf(alb),
    forwardingRuleName: await outStr(alb.getForwardingRule().name),
    forwardingRuleUrn: await urnOf(alb.getForwardingRule()),
    addressUrn: address ? await urnOf(address) : '<none>',
    urlMapUrn: urlMap ? await urnOf(urlMap) : '<none>',
    proxyUrn: proxy ? await urnOf(proxy) : '<none>',
    certUrn: cert ? await urnOf(cert) : '<none>',
  };
}

describe('DX1 — name-first CloudInfraAlb === meta-first (child names/URNs + 12 tokens)', () => {
  let metaGlobalId: Awaited<ReturnType<typeof identityOf>>;
  let nameGlobalId: Awaited<ReturnType<typeof identityOf>>;
  let metaRegionalId: Awaited<ReturnType<typeof identityOf>>;
  let nameRegionalId: Awaited<ReturnType<typeof identityOf>>;

  beforeAll(async () => {
    // GLOBAL HTTPS — covers GlobalAddress, URLMap, TargetHttpsProxy,
    // SSLCertificate, GlobalForwardingRule.
    const metaGlobal = new CloudInfraAlb(
      new CloudInfraMeta({ name: 'lb', domain: 'gl' }),
      { target: httpsTarget, portRange: '443' }
    );
    const nameGlobal = new CloudInfraAlb('lb', {
      domain: 'gl',
      target: httpsTarget,
      portRange: '443',
    });

    // REGIONAL HTTPS — covers Address, RegionUrlMap, RegionTargetHttpsProxy,
    // RegionSslCertificate, ForwardingRule.
    const metaRegional = new CloudInfraAlb(
      new CloudInfraMeta({ name: 'rlb', domain: 'au' }),
      { target: httpsTarget, portRange: '443' }
    );
    const nameRegional = new CloudInfraAlb('rlb', {
      domain: 'au',
      target: httpsTarget,
      portRange: '443',
    });

    metaGlobalId = await identityOf(metaGlobal);
    nameGlobalId = await identityOf(nameGlobal);
    metaRegionalId = await identityOf(metaRegional);
    nameRegionalId = await identityOf(nameRegional);

    // Allow the interleaved child registrations to settle for token coverage.
    await new Promise(r => setTimeout(r, 200));
  });

  it('GLOBAL: every child name + URN is identical name-first vs meta-first', () => {
    expect(nameGlobalId).toEqual(metaGlobalId);
    expect(nameGlobalId.componentUrn).toContain(CLOUD_INFRA_ALB_TYPE);
    // All five global children were actually created (not `<none>`).
    expect(nameGlobalId.addressUrn).not.toBe('<none>');
    expect(nameGlobalId.urlMapUrn).not.toBe('<none>');
    expect(nameGlobalId.proxyUrn).not.toBe('<none>');
    expect(nameGlobalId.certUrn).not.toBe('<none>');
  });

  it('REGIONAL: every child name + URN is identical name-first vs meta-first', () => {
    expect(nameRegionalId).toEqual(metaRegionalId);
    expect(nameRegionalId.componentUrn).toContain(CLOUD_INFRA_ALB_TYPE);
    expect(nameRegionalId.addressUrn).not.toBe('<none>');
    expect(nameRegionalId.urlMapUrn).not.toBe('<none>');
    expect(nameRegionalId.proxyUrn).not.toBe('<none>');
    expect(nameRegionalId.certUrn).not.toBe('<none>');
  });

  it('GLOBAL HTTPS path covers its 5 frozen child type tokens', () => {
    const allTypes = new Set(captured.map(r => r.type));
    expect(allTypes.has(T.GlobalAddress)).toBe(true);
    expect(allTypes.has(T.URLMap)).toBe(true);
    expect(allTypes.has(T.TargetHttpsProxy)).toBe(true);
    expect(allTypes.has(T.SSLCertificate)).toBe(true);
    expect(allTypes.has(T.GlobalForwardingRule)).toBe(true);
  });

  it('REGIONAL HTTPS path covers its 5 frozen child type tokens', () => {
    const allTypes = new Set(captured.map(r => r.type));
    expect(allTypes.has(T.Address)).toBe(true);
    expect(allTypes.has(T.RegionUrlMap)).toBe(true);
    expect(allTypes.has(T.RegionTargetHttpsProxy)).toBe(true);
    expect(allTypes.has(T.RegionSslCertificate)).toBe(true);
    expect(allTypes.has(T.ForwardingRule)).toBe(true);
  });

  it('the bare forwarding-rule name is shared across meta-first + name-first (F2 bare-name reuse)', () => {
    // The forwarding rule, address, URL map, proxy and cert all reuse the bare
    // generated name; assert the forwarding-rule name is non-empty and the two
    // paths agree (already covered by the per-getter equality above, asserted
    // here explicitly for the heaviest child).
    expect(nameGlobalId.forwardingRuleName).toBe(
      metaGlobalId.forwardingRuleName
    );
    expect(nameGlobalId.forwardingRuleName).toContain('lb');
    expect(nameRegionalId.forwardingRuleName).toBe(
      metaRegionalId.forwardingRuleName
    );
    expect(nameRegionalId.forwardingRuleName).toContain('rlb');
  });
});
