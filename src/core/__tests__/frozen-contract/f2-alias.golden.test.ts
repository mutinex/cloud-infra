/**
 * Frozen Contract F2 / alias — migration-safety golden snapshots.
 *
 * See `docs/v2-redesign-notes.md` §2 (F1/F2), §4 (alias maps old→new URN), §7
 * (in-repo "preview proof" = the alias maps the old flat URN → new parented URN),
 * and §9/§9b/§9c (real-preview validation).
 *
 * This repo is a LIBRARY — there is no live Pulumi state, so we use
 * `pulumi.runtime.setMocks` (the pattern from the cloudrunservice v2 prototype)
 * to capture each child's COMPUTED `__aliases` and child NAME, and pin:
 *
 *   - that every converted component's label-supporting child carries an alias
 *     back to its OLD FLAT (pre-v2, root-level) URN, so an existing deployment
 *     migrates IN-PLACE instead of destroy/recreate;
 *   - the `:`/`-`-delimited child NAME strings (F2 suffix conventions).
 *
 * ── WHAT THESE MOCK-BASED TESTS CAN PROVE ────────────────────────────────────
 *   • A root-aliased child's computed alias === the exact old root-level URN.
 *   • The child NAME strings (F1/F2) are byte-identical.
 *   • The component type tokens are the documented `cloud-infra:*` tokens.
 *
 * ── WHAT THEY CANNOT PROVE (honesty note — needs a real `pulumi preview`) ─────
 *   • PARENT-ALIAS INHERITANCE for grandchildren with NO explicit alias
 *     (Secret→SecretVersion, CloudRunService→NEG). Under `setMocks`, such a
 *     grandchild's `__aliases` is EMPTY (or component-prefixed) — the mock does
 *     NOT reconstruct the true old URN from the parent's alias. The real preview
 *     against dataos `dev` (§9/§9c) confirmed inheritance reconstructs those old
 *     URNs with NO change; that is the load-bearing fact these mocks cannot
 *     reproduce. We pin the OBSERVED mock behavior (empty alias) so a change to
 *     it is at least visible and forces re-confirmation against a real preview.
 *   • `setMocks` strips resource `opts`, so we cannot read back the alias SPEC
 *     (`{ parent: rootStackResource }`); we assert the COMPUTED `__aliases` URN
 *     list Pulumi derives from it instead.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Mocks + config MUST be set before importing anything that builds resources.
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
      const state: Record<string, unknown> = {
        ...args.inputs,
        name: args.inputs.name ?? args.name,
      };
      // DnsAuthorization computes `dnsResourceRecords` server-side; the
      // certificatemap component reads `dnsResourceRecords[0]` to wire the
      // cloudflare validation record. Provide a benign mock value so that
      // downstream `.apply` does not reject (the value is irrelevant to the
      // alias/name assertions here).
      if (args.type === T_DNS_AUTH) {
        state.dnsResourceRecords = [
          { name: '_acme.example.com', type: 'CNAME', data: 'auth.example.com' },
        ];
      }
      return { id: `${args.name}-id`, state };
    },
    call(): Record<string, unknown> {
      return {};
    },
  },
  'project', // → URN `project` segment
  'stack' // → URN `stack` segment + `env` label
);

// Import AFTER mocks are configured.
import { CloudInfraMeta } from '../../meta';
import { CloudInfraBucket, BUCKET_TYPE } from '../../../components/bucket/single';
import {
  CloudInfraAccount,
  ACCOUNT_TYPE,
} from '../../../components/account/single';
import { CloudInfraSecretVersion } from '../../../components/secret';
import {
  CloudInfraCertificateMap,
  CERTIFICATE_MAP_TYPE,
} from '../../../components/certificatemap';

// ── Frozen GCP type tokens (the OLD flat URN type segment per child) ─────────
const T_BUCKET = 'gcp:storage/bucket:Bucket';
const T_SA = 'gcp:serviceaccount/account:Account';
const T_REGIONAL_SECRET = 'gcp:secretmanager/regionalSecret:RegionalSecret';
const T_REGIONAL_SECRET_VERSION =
  'gcp:secretmanager/regionalSecretVersion:RegionalSecretVersion';
const T_SECRET = 'gcp:secretmanager/secret:Secret';
const T_SECRET_VERSION = 'gcp:secretmanager/secretVersion:SecretVersion';
const T_CERT_MAP = 'gcp:certificatemanager/certificateMap:CertificateMap';
const T_CERT = 'gcp:certificatemanager/certificate:Certificate';
const T_DNS_AUTH = 'gcp:certificatemanager/dnsAuthorization:DnsAuthorization';
const T_CERT_MAP_ENTRY =
  'gcp:certificatemanager/certificateMapEntry:CertificateMapEntry';
const T_CF_DNS_RECORD = 'cloudflare:index/dnsRecord:DnsRecord';

/** The old flat (root-level, no component prefix) URN for a child. */
function oldFlatUrn(type: string, name: string): string {
  return `urn:pulumi:stack::project::${type}::${name}`;
}

/** Resolve a resource instance's computed alias URN list (`__aliases`). */
async function resolveAliases(resource: unknown): Promise<string[]> {
  const aliases = (resource as { __aliases?: pulumi.Output<string>[] })
    .__aliases;
  if (!aliases || aliases.length === 0) return [];
  return Promise.all(
    aliases.map(
      a =>
        new Promise<string>(resolve => {
          (a as pulumi.Output<string>).apply(v => {
            resolve(v);
            return v;
          });
        })
    )
  );
}

function capturedNames(type: string): string[] {
  return captured.filter(r => r.type === type).map(r => r.name);
}

/**
 * Wait until the mock has finished registering resources, detected by the
 * `captured` count going QUIESCENT (unchanged across two consecutive polls)
 * rather than a fixed wall-clock sleep — so a slow CI runner cannot race the
 * registration and produce a flaky empty-alias read. Capped so a genuine hang
 * still fails fast.
 */
async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

// =============================================================================
// Pattern (a) — single root-aliased child
// =============================================================================
describe('F2/alias (a) — single root-aliased child', () => {
  let bucket: CloudInfraBucket;
  let account: CloudInfraAccount;

  beforeAll(async () => {
    bucket = new CloudInfraBucket(
      new CloudInfraMeta({ name: 'assets', domain: 'au' })
    );
    account = new CloudInfraAccount(
      new CloudInfraMeta({ name: 'app', domain: 'au' })
    );
    await waitForCaptures();
  });

  it('Bucket: type token is the cloud-infra component token', () => {
    expect(BUCKET_TYPE).toBe('cloud-infra:bucket:Bucket');
  });

  it('Bucket: child gcp.storage.Bucket aliases back to its OLD flat root URN', async () => {
    const aliases = await resolveAliases(bucket.getBucket());
    expect(aliases).toEqual([oldFlatUrn(T_BUCKET, 'project-assets-au')]);
  });

  it('Bucket: child NAME is the F1 generated name (byte-identical)', () => {
    expect(capturedNames(T_BUCKET)).toEqual(['project-assets-au']);
  });

  it('ServiceAccount: type token is the cloud-infra component token', () => {
    expect(ACCOUNT_TYPE).toBe('cloud-infra:account:CloudInfraAccount');
  });

  it('ServiceAccount: child Account carries EXACTLY its two computed migration aliases', async () => {
    // The SA carries TWO computed aliases (verified empirically against the
    // pinned Pulumi 3.181 + @pulumi/gcp 8.x):
    //   [0] from the explicit `{ parent: rootStackResource }` (single.ts:117) →
    //       the OLD flat root URN. This is the LOAD-BEARING migration alias: the
    //       SA name == accountId == email identity (F1, the highest-stakes
    //       value), so this URN must stay byte-identical for in-place migration.
    //   [1] a Pulumi-auto inherited alias the ComponentResource machinery derives
    //       from the component parent. NOTE the GCP type-token CASING flips here
    //       (`gcp:serviceAccount/...` capital A) vs [0] (`serviceaccount`) — that
    //       is Pulumi's alias-token table, not our code. We pin it EXACTLY (not a
    //       loose `toContain`) so that ANY change to the alias set — a dropped
    //       migration alias, a reordering, or a spurious extra alias that would
    //       itself surface as a diff in a real preview — fails this test.
    const aliases = await resolveAliases(account.serviceAccount);
    expect(aliases).toEqual([
      oldFlatUrn(T_SA, 'project-app-au'),
      'urn:pulumi:stack::project::cloud-infra:account:CloudInfraAccount$gcp:serviceAccount/account:Account::project-app-au',
    ]);
  });

  it('ServiceAccount: child NAME (== accountId → SA email identity) is byte-identical', () => {
    expect(capturedNames(T_SA)).toEqual(['project-app-au']);
  });
});

// =============================================================================
// Pattern (b) — parent-inherited grandchild (Secret → SecretVersion).
//
// HONESTY: the block NAME describes the migration STRATEGY (the grandchild
// relies on parent-alias inheritance), but inheritance is NOT reproducible under
// setMocks — the assertions below PROVE the parent's root-alias and pin the
// grandchild's computed alias as EMPTY. The inheritance itself is validated only
// by the real preview (§9c), which this suite cannot reproduce.
// =============================================================================
describe('F2/alias (b) — parent root-alias + grandchild (inheritance NOT reproducible under mocks; see §9c)', () => {
  let regional: CloudInfraSecretVersion;
  let global: CloudInfraSecretVersion;

  beforeAll(async () => {
    // Regional path (single au region → RegionalSecret + RegionalSecretVersion).
    regional = new CloudInfraSecretVersion(
      new CloudInfraMeta({ name: 'cfg', domain: 'au' }),
      { secretData: 'value' }
    );
    // Global path (dual-region array → Secret + SecretVersion, replicated). The
    // name uses the JOINED region code (F1 array nuance), NOT a `nam4`-style code.
    global = new CloudInfraSecretVersion(
      new CloudInfraMeta({
        name: 'glob',
        domain: 'au',
        location: ['us-central1', 'us-east1'],
        gcpProject: 'test-project',
      }),
      { secretData: 'value' }
    );
    await waitForCaptures();
  });

  it('RegionalSecret (regional, single au region): aliases back to its OLD flat root URN', async () => {
    // The label-supporting RegionalSecret is the root-aliased parent.
    const aliases = await resolveAliases(regional.getSecret());
    expect(aliases).toEqual([oldFlatUrn(T_REGIONAL_SECRET, 'project-cfg-au')]);
  });

  it('RegionalSecret + RegionalSecretVersion NAMES are byte-identical (same generated name)', () => {
    expect(capturedNames(T_REGIONAL_SECRET)).toEqual(['project-cfg-au']);
    expect(capturedNames(T_REGIONAL_SECRET_VERSION)).toEqual(['project-cfg-au']);
  });

  it('global Secret (dual-region array): aliases back to its OLD flat root URN', async () => {
    const aliases = await resolveAliases(global.getSecret());
    expect(aliases).toEqual([
      oldFlatUrn(T_SECRET, 'project-glob-us-c1-us-e1'),
    ]);
  });

  it('global Secret + SecretVersion NAMES are byte-identical (joined region code, F1)', () => {
    expect(capturedNames(T_SECRET)).toEqual(['project-glob-us-c1-us-e1']);
    expect(capturedNames(T_SECRET_VERSION)).toEqual([
      'project-glob-us-c1-us-e1',
    ]);
  });

  it('SecretVersion grandchildren (regional + global) have NO computed alias under mocks (documented limitation — NOT proof of in-place migration)', async () => {
    // HONESTY NOTE (see block name + file header): the *Version resources rely
    // on PARENT-ALIAS INHERITANCE from the root-aliased Secret. `setMocks` does
    // NOT reconstruct that — the grandchild's computed `__aliases` is EMPTY. The
    // real preview (§9c) confirmed the inherited old URN lands the version in
    // `unchanged`. We pin the observed-empty value so a future change to it is
    // visible and re-triggers real-preview confirmation.
    expect(await resolveAliases(regional.getVersion())).toEqual([]);
    expect(await resolveAliases(global.getVersion())).toEqual([]);
  });
});

// =============================================================================
// Pattern (c) — multi-resource component with deep nesting (CertificateMap)
// =============================================================================
describe('F2/alias (c) — multi-resource deep nesting (CertificateMap, global)', () => {
  let cm: CloudInfraCertificateMap;

  beforeAll(async () => {
    cm = new CloudInfraCertificateMap(
      new CloudInfraMeta({
        name: 'web',
        domain: 'gl',
        gcpProject: 'test-project',
      }),
      {
        cloudflareZoneId: 'zone123',
        certificates: [{ name: 'api', domains: ['api.example.com'] }],
      }
    );
    await waitForCaptures();
  });

  it('type token is the cloud-infra component token', () => {
    expect(CERTIFICATE_MAP_TYPE).toBe(
      'cloud-infra:certificatemap:CloudInfraCertificateMap'
    );
  });

  it('CertificateMap (label-supporting child): aliases back to its OLD flat root URN', async () => {
    const aliases = await resolveAliases(cm.getCertificateMap());
    expect(aliases).toEqual([oldFlatUrn(T_CERT_MAP, 'project-web-gl')]);
  });

  it('F2 child-NAME suffix conventions are byte-identical (`-domain` / `-cert.name` / `-hostname`, sanitized)', () => {
    // resourceName = `project-web-gl`. Suffixes are appended verbatim with the
    // documented sanitisation (lowercase, `*`→`star`, `.`→`-`, truncated).
    expect(capturedNames(T_CERT_MAP)).toEqual(['project-web-gl']);
    // DnsAuthorization: `${resourceName}-${sanitize(domain)}` → dots become `-`.
    expect(capturedNames(T_DNS_AUTH)).toEqual(['project-web-gl-api-example-com']);
    // Certificate: `${resourceName}-${cert.name}`.
    expect(capturedNames(T_CERT)).toEqual(['project-web-gl-api']);
    // CertificateMapEntry: `${resourceName}-${sanitize(hostname)}`.
    expect(capturedNames(T_CERT_MAP_ENTRY)).toEqual([
      'project-web-gl-api-example-com',
    ]);
    // cloudflare.DnsRecord (label-UNsupported child): `${resourceName}-${sanitize(domain)}`.
    expect(capturedNames(T_CF_DNS_RECORD)).toEqual([
      'project-web-gl-api-example-com',
    ]);
  });

  it('every label-supporting cert child carries its own root-alias (deep nesting, per-resource)', async () => {
    // DnsAuthorization, Certificate, CertificateMapEntry are all created FLAT in
    // v1 and each explicitly aliases back to root (they are not relying on
    // inheritance). Pin each computed alias to its old flat URN.
    const [dnsAuth] = Object.values(
      (cm as unknown as {
        dnsAuthorizations: Record<string, Record<string, unknown>>;
      }).dnsAuthorizations.api
    );
    const cert = cm.getManagedCertificate('api');
    const [entry] = Object.values(
      (cm as unknown as {
        certificateMapEntries: Record<string, unknown>;
      }).certificateMapEntries
    );

    expect(await resolveAliases(dnsAuth)).toEqual([
      oldFlatUrn(T_DNS_AUTH, 'project-web-gl-api-example-com'),
    ]);
    expect(await resolveAliases(cert)).toEqual([
      oldFlatUrn(T_CERT, 'project-web-gl-api'),
    ]);
    expect(await resolveAliases(entry)).toEqual([
      oldFlatUrn(T_CERT_MAP_ENTRY, 'project-web-gl-api-example-com'),
    ]);
  });

  it('the label-UNsupported cloudflare.DnsRecord ALSO carries its root-alias (migration safety for the DNS validation record)', async () => {
    // The DNS validation record is created FLAT in v1 with a PLAIN-parent root
    // alias (NOT childOpts — cloudflare.DnsRecord has no `labels`). It carries
    // TWO computed aliases: [0] the load-bearing old flat root URN, and [1] a
    // Pulumi-auto inherited alias (note the casing flip `index/record:Record`).
    // Pin BOTH EXACTLY so a dropped/changed validation-record alias is caught.
    const [record] = Object.values(
      (cm as unknown as {
        cloudflareRecords: Record<string, Record<string, unknown>>;
      }).cloudflareRecords.api
    );
    expect(await resolveAliases(record)).toEqual([
      oldFlatUrn(T_CF_DNS_RECORD, 'project-web-gl-api-example-com'),
      'urn:pulumi:stack::project::cloud-infra:certificatemap:CloudInfraCertificateMap$cloudflare:index/record:Record::project-web-gl-api-example-com',
    ]);
  });
});
