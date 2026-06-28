/**
 * WS-C Task 4 — `CloudInfraCertificateMap` uniform `labels` surface.
 *
 * Proves the ADDITIVE `labels?: Record<string,string>` config field is merged
 * into every label-supporting child (CertificateMap, DnsAuthorization,
 * Certificate, CertificateMapEntry) via the existing `withLabels` mechanism
 * (`{ ...orgLabels, ...labels }` — caller labels win), AND that when no `labels`
 * are supplied the emitted labels are the org floor only (byte-identical to the
 * prior behaviour). The label-UNSUPPORTED Cloudflare record is never labelled.
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
      const extra: Record<string, unknown> = {};
      // DnsAuthorization exposes `dnsResourceRecords[0]` which the Cloudflare
      // record path reads; provide a stub so that apply doesn't throw.
      if (args.type.endsWith('dnsAuthorization:DnsAuthorization')) {
        extra.dnsResourceRecords = [
          { name: '_acme.example.com', type: 'CNAME', data: 'x.example.com' },
        ];
      }
      return {
        id: `${args.name}-id`,
        state: { ...args.inputs, name: args.inputs.name ?? args.name, ...extra },
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
import { CloudInfraCertificateMap } from '../index';

const LABEL_SUPPORTING_TYPES = [
  'gcp:certificatemanager/certificateMap:CertificateMap',
  'gcp:certificatemanager/dnsAuthorization:DnsAuthorization',
  'gcp:certificatemanager/certificate:Certificate',
  'gcp:certificatemanager/certificateMapEntry:CertificateMapEntry',
];

const ORG_LABELS = {
  domain: 'gl',
  env: 'stack',
  'managed-by': 'cloud-infra',
  service: 'project-web-gl',
};

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (predicate()) return;
  }
}

describe('WS-C Task 4 — CloudInfraCertificateMap labels surface', () => {
  beforeAll(async () => {
    // No labels → org floor only.
    new CloudInfraCertificateMap(
      new CloudInfraMeta({ name: 'web', domain: 'gl' }),
      {
        certificates: [{ name: 'api', domains: ['api.example.com'] }],
        cloudflareZoneId: 'zone1',
      }
    );
    // With caller labels → merged atop org floor.
    new CloudInfraCertificateMap(
      new CloudInfraMeta({ name: 'shop', domain: 'gl' }),
      {
        certificates: [{ name: 'api', domains: ['api.shop.com'] }],
        cloudflareZoneId: 'zone2',
        labels: { team: 'payments', service: 'override-me' },
      }
    );
    await waitFor(
      () =>
        captured.filter(r =>
          r.type.startsWith('gcp:certificatemanager')
        ).length >= 8
    );
  });

  it('without labels: every label-supporting child carries ONLY the org floor', () => {
    const web = captured.filter(
      r => LABEL_SUPPORTING_TYPES.includes(r.type) && r.name.startsWith('project-web-gl')
    );
    expect(web.length).toBe(4);
    for (const r of web) {
      expect(r.inputs.labels).toEqual(ORG_LABELS);
    }
  });

  it('with labels: caller labels merge atop the org floor (caller wins on collision)', () => {
    const shop = captured.filter(
      r => LABEL_SUPPORTING_TYPES.includes(r.type) && r.name.startsWith('project-shop-gl')
    );
    expect(shop.length).toBe(4);
    for (const r of shop) {
      expect(r.inputs.labels).toEqual({
        domain: 'gl',
        env: 'stack',
        'managed-by': 'cloud-infra',
        team: 'payments',
        // caller's `service` overrides the org-floor `service`.
        service: 'override-me',
      });
    }
  });

  it('no label-unsupported gcp child (none here) receives a labels key beyond the 4 supported types', () => {
    // Sanity: every captured gcp resource carrying a `labels` key is one of the
    // 4 label-supporting certificatemanager types — the labels surface did not
    // leak onto any other resource.
    const gcpWithLabels = captured.filter(
      r => r.type.startsWith('gcp:') && 'labels' in (r.inputs as object)
    );
    expect(gcpWithLabels.length).toBeGreaterThan(0);
    for (const r of gcpWithLabels) {
      expect(LABEL_SUPPORTING_TYPES).toContain(r.type);
    }
  });
});
