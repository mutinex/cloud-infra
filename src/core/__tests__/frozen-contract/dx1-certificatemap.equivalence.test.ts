/**
 * DX1 — name-first CertificateMap equivalence (Frozen Contract F1 / F2).
 *
 * `new CloudInfraCertificateMap("certs", { domain: "gl", certificates: [...], cloudflareZoneId: "..." })`
 * (name-first, v2 DX) must produce the IDENTICAL physical resource names AND
 * identical child URNs as the legacy meta-first
 * `new CloudInfraCertificateMap(new CloudInfraMeta({ name: "certs", domain: "gl" }), {...})`.
 *
 * CertificateMap derives EVERY child name from the full config: the
 * `-${cert.name}` Certificate suffix and the sanitized
 * `-${sanitize(domain)}`/`-${sanitize(hostname)}` DNS-authorization / map-entry
 * suffixes. The name-first change only reroutes how the meta is obtained, so
 * every captured child name must stay byte-identical. If a child suffix
 * differed, switching a consuming stack to the name-first overload would
 * destroy/recreate the certificate (F1/F2 violation). This mirrors
 * `dx1-cloudrunservice.equivalence.test.ts`.
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
        state: {
          ...args.inputs,
          name: args.inputs.name ?? args.name,
          // DnsAuthorization exposes `dnsResourceRecords`; the Cloudflare record
          // child reads `records[0]` off it — supply a stub so the apply chain
          // resolves (NAMES, not record contents, are what this test pins).
          dnsResourceRecords: [
            { name: `_acme.${args.name}`, type: 'CNAME', data: 'validate.gcp' },
          ],
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
import {
  CloudInfraCertificateMap,
  CERTIFICATE_MAP_TYPE,
} from '../../../components/certificatemap';

const T_CERTIFICATE = 'gcp:certificatemanager/certificate:Certificate';
const T_DNS_AUTH =
  'gcp:certificatemanager/dnsAuthorization:DnsAuthorization';

/** Resolve a resource's URN string. */
async function urnOf(resource: pulumi.Resource): Promise<string> {
  return new Promise<string>(resolve => {
    resource.urn.apply(u => {
      resolve(u);
      return u;
    });
  });
}

/**
 * Wait until resource registration goes QUIESCENT (count unchanged across two
 * polls). CertificateMap emits its Cloudflare-record children only after the
 * DnsAuthorization's `dnsResourceRecords` apply resolves — several async ticks
 * — so a fixed delay is race-prone. Capped so a genuine hang fails fast.
 */
async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

const CONFIG = {
  certificates: [
    {
      name: 'api',
      // Wildcard + dotted domain exercises the sanitizer (`.`→`-`, `*`→`star`).
      domains: ['api.example.com'],
      wildcard: true,
    },
  ],
  cloudflareZoneId: 'test-zone-id',
};

describe('DX1 — name-first CertificateMap === meta-first (child suffix names + URN)', () => {
  let metaFirstComponentUrn: string;
  let nameFirstComponentUrn: string;

  beforeAll(async () => {
    // Meta-first (legacy) path.
    const metaFirst = new CloudInfraCertificateMap(
      new CloudInfraMeta({ name: 'certs', domain: 'gl' }),
      CONFIG
    );
    // Name-first (v2 DX) path.
    const nameFirst = new CloudInfraCertificateMap('certs', {
      domain: 'gl',
      ...CONFIG,
    });

    metaFirstComponentUrn = await urnOf(metaFirst);
    nameFirstComponentUrn = await urnOf(nameFirst);

    // Let every deep child (Certificate, DnsAuthorization, Cloudflare record,
    // CertificateMap + entries) finish registering before asserting on names.
    await waitForCaptures();
  });

  it('the `-${cert.name}` Certificate child suffix NAME is identical name-first vs meta-first', () => {
    const certs = captured.filter(r => r.type === T_CERTIFICATE);
    // Two identical constructions ⇒ two Certificate children with equal names.
    expect(certs.length).toBe(2);
    expect(certs[0].name).toBe(certs[1].name);
    // The load-bearing convention: the suffix is the bare cert.name (`-api`).
    expect(certs[0].name.endsWith('-api')).toBe(true);
  });

  it('the sanitized `-${domain}` DnsAuthorization child suffix NAME is identical', () => {
    const auths = captured.filter(r => r.type === T_DNS_AUTH);
    expect(auths.length).toBe(2);
    expect(auths[0].name).toBe(auths[1].name);
    // Sanitizer turned dots into hyphens (`api.example.com` → `api-example-com`).
    expect(auths[0].name.endsWith('-api-example-com')).toBe(true);
  });

  it('every captured child NAME matches byte-for-byte across the two paths', () => {
    // Registration order across the two constructions is async/interleaved, so
    // compare the full multiset of `type|name` keys instead of relying on order:
    // each child built by an identical construction appears EXACTLY twice. This
    // covers Certificate, DnsAuthorization, Cloudflare record, CertificateMap +
    // entries (incl. the sanitized wildcard `star-` hostnames).
    const counts = new Map<string, number>();
    for (const r of captured) {
      const key = `${r.type}|${r.name}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Every distinct child key must have an even count (matched pair) — an odd
    // count means a child name diverged between name-first and meta-first.
    const odd = [...counts.entries()].filter(([, n]) => n % 2 !== 0);
    expect(odd).toEqual([]);
    // And there must be real children captured (guard against an empty pass).
    expect(counts.size).toBeGreaterThan(1);
  });

  it('the sanitized wildcard `star-` map-entry hostname suffix is present and paired', () => {
    // `wildcard: true` emits a `*.api.example.com` hostname; the sanitizer turns
    // `*`→`star` and `.`→`-` ⇒ a `...-star-api-example-com` map-entry child.
    // Direct assertion that the `*`→`star` path is exercised AND identical
    // across both construction paths.
    const entries = captured.filter(
      r =>
        r.type ===
        'gcp:certificatemanager/certificateMapEntry:CertificateMapEntry'
    );
    const starEntries = entries.filter(r =>
      r.name.includes('-star-api-example-com')
    );
    // One per construction ⇒ exactly two, with identical names.
    expect(starEntries.length).toBe(2);
    expect(starEntries[0].name).toBe(starEntries[1].name);
  });

  it('the component URN is identical (the F2 migration identity)', () => {
    expect(nameFirstComponentUrn).toBe(metaFirstComponentUrn);
    expect(nameFirstComponentUrn).toContain(CERTIFICATE_MAP_TYPE);
  });
});
