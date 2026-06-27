/**
 * Flat KEYED-MAP outputs (producer).
 *
 * `CloudInfraOutput.record(...)` keeps writing the legacy nested
 * `data[domain][resourceType][groupingKey]` map AND now also projects each
 * recorded resource into a flat, single-level KEYED MAP exposed via
 * `getFlatOutputs()`: one key per SCALAR field, keyed
 * `<domain>.<service>[.<region>].<name>.<field>` (separator `.`), mapping to a
 * single `pulumi.Output<string>`. These tests pin the key grammar, the
 * scalar-field filter, the region rule, the number→string coercion, and the
 * collision-throw. The nested format must stay byte-unchanged.
 *
 * `record()` copies Pulumi `Output` fields by REFERENCE; the producer wraps
 * each scalar in a single `.apply(String)`. The mock below makes `.apply`
 * synchronous so a key's resolved string can be asserted without a Pulumi
 * runtime.
 */
import { describe, it, expect } from 'vitest';
import { CloudInfraOutput } from '../output-manager';
import type { OutputResource } from '../output-manager';
import type { CloudInfraMeta } from '../../meta';
import type * as pulumi from '@pulumi/pulumi';

// A meta stub. `record()` calls `getDomain()`; the flat projector additionally
// calls `getLocation()` to derive a region segment for regional resources.
const metaFor = (domain: string, location?: string): CloudInfraMeta =>
  ({
    getDomain: () => domain,
    getLocation: () => location ?? domain,
  }) as unknown as CloudInfraMeta;

// Sentinel "Output" value with a synchronous `.apply` so the producer's
// `.apply(String)` coercion resolves eagerly to a plain string for assertions.
const out = (value: unknown): pulumi.Output<string> =>
  ({
    apply: (fn: (v: unknown) => unknown) => fn(value),
  }) as unknown as pulumi.Output<string>;

// Resolves a stored flat value to its plain string. The producer now coerces
// CONDITIONALLY: the `number` field is wrapped in `.apply(String)` (so the
// stored value is the coerced Output), while already-`Output<string>` fields are
// assigned BY REFERENCE (so the stored value IS the original mock Output). Both
// expose the synchronous mock `.apply`, so applying identity here resolves the
// underlying value uniformly regardless of which path produced it.
const resolve = (
  map: Record<string, pulumi.Output<string>>,
  key: string
): unknown => {
  const stored = map[key] as unknown;
  // A by-reference `Output<string>` is the original mock object (has synchronous
  // `.apply`); a coerced `number` field already resolved to a plain string under
  // the synchronous mock. Normalise both to the underlying value.
  if (stored && typeof (stored as { apply?: unknown }).apply === 'function') {
    return (stored as pulumi.Output<unknown>).apply(v => v);
  }
  return stored;
};

describe('CloudInfraOutput.getFlatOutputs() — flat keyed map', () => {
  it('a single GLOBAL resource emits one key per scalar field, NO region segment', () => {
    const mgr = new CloudInfraOutput();
    const sa = {
      id: out('proj/sa/my-app'),
      name: out('my-app-sa'),
      email: out('my-app@proj.iam.gserviceaccount.com'),
      member: out('serviceAccount:my-app@proj.iam.gserviceaccount.com'),
    } as unknown as OutputResource;

    mgr.record('gcp:serviceaccount:Account', 'my-app', metaFor('au'), sa);

    const flat = mgr.getFlatOutputs();
    expect(Object.keys(flat).sort()).toEqual(
      [
        'au.sa.my-app.id',
        'au.sa.my-app.name',
        'au.sa.my-app.email',
        'au.sa.my-app.member',
      ].sort()
    );
  });

  it('the composed VALUE is the resource Output (coerced to string)', () => {
    const mgr = new CloudInfraOutput();
    const sa = {
      id: out('proj/sa/my-app'),
      email: out('my-app@proj.iam.gserviceaccount.com'),
    } as unknown as OutputResource;
    mgr.record('gcp:serviceaccount:Account', 'my-app', metaFor('au'), sa);
    const flat = mgr.getFlatOutputs();
    expect(resolve(flat, 'au.sa.my-app.id')).toBe('proj/sa/my-app');
    expect(resolve(flat, 'au.sa.my-app.email')).toBe(
      'my-app@proj.iam.gserviceaccount.com'
    );
  });

  it('a REGIONAL resource (entry has `location`) includes the region segment', () => {
    const mgr = new CloudInfraOutput();
    const subnet = {
      id: out('subnet-id'),
      name: out('subnet-name'),
      // presence of `location` is the synchronous "is regional" signal
      location: out('us-central1'),
    } as unknown as OutputResource;

    mgr.record(
      'gcp:compute:Subnetwork',
      'services',
      metaFor('us', 'us-central1'),
      subnet
    );

    const flat = mgr.getFlatOutputs();
    expect(Object.keys(flat).sort()).toEqual(
      [
        'us.subnet.us-c1.services.id',
        'us.subnet.us-c1.services.name',
        'us.subnet.us-c1.services.location',
      ].sort()
    );
  });

  it('australia region shortens to au-se1', () => {
    const mgr = new CloudInfraOutput();
    const subnet = {
      id: out('id'),
      location: out('australia-southeast1'),
    } as unknown as OutputResource;
    mgr.record(
      'gcp:compute:Subnetwork',
      'main',
      metaFor('au', 'australia-southeast1'),
      subnet
    );
    expect(Object.keys(mgr.getFlatOutputs())).toContain(
      'au.subnet.au-se1.main.id'
    );
  });

  it('a multi-region location token is used verbatim in the region segment', () => {
    const mgr = new CloudInfraOutput();
    const bucket = {
      id: out('id'),
      location: out('US'),
    } as unknown as OutputResource;
    mgr.record('gcp:storage:Bucket', 'assets', metaFor('us', 'us'), bucket);
    expect(Object.keys(mgr.getFlatOutputs())).toContain(
      'us.bucket.us.assets.id'
    );
  });

  it('EXCLUDES non-scalar fields (urls array, customPlacementConfig object)', () => {
    const mgr = new CloudInfraOutput();
    const svc = {
      id: out('id'),
      uri: out('https://svc-abc.run.app'),
      location: out('us-central1'),
      urls: out(['https://a', 'https://b']), // array — excluded
      customPlacementConfig: out({ dataLocations: ['us'] }), // object — excluded
    } as unknown as OutputResource;
    mgr.record('gcp:cloudrunv2:Service', 'api', metaFor('us', 'us-central1'), svc);
    const keys = Object.keys(mgr.getFlatOutputs());
    expect(keys).toContain('us.run.us-c1.api.id');
    expect(keys).toContain('us.run.us-c1.api.uri');
    expect(keys.some(k => k.endsWith('.urls'))).toBe(false);
    expect(keys.some(k => k.endsWith('.customPlacementConfig'))).toBe(false);
  });

  it('multiple resources contribute keys under one map; multi-field per resource', () => {
    const mgr = new CloudInfraOutput();
    const sa = {
      id: out('sa-id'),
      email: out('sa-email'),
    } as unknown as OutputResource;
    const bucket = {
      id: out('b-id'),
      location: out('us-central1'),
    } as unknown as OutputResource;

    mgr.record('gcp:serviceaccount:Account', 'app', metaFor('au'), sa);
    mgr.record('gcp:storage:Bucket', 'archive', metaFor('us', 'us-central1'), bucket);

    expect(Object.keys(mgr.getFlatOutputs()).sort()).toEqual(
      [
        'au.sa.app.id',
        'au.sa.app.email',
        'us.bucket.us-c1.archive.id',
        'us.bucket.us-c1.archive.location',
      ].sort()
    );
  });

  it('THROWS on a composed-key collision (same domain.service.name.field)', () => {
    const mgr = new CloudInfraOutput();
    const a = { id: out('a') } as unknown as OutputResource;
    const b = { id: out('b') } as unknown as OutputResource;
    mgr.record('gcp:serviceaccount:Account', 'dup', metaFor('au'), a);
    expect(() =>
      mgr.record('gcp:serviceaccount:Account', 'dup', metaFor('au'), b)
    ).toThrow(/Flat-output key collision: 'au\.sa\.dup\.id'/);
  });

  it('THROWS when two DISTINCT resources compose the same prefix with DISJOINT fields', () => {
    // Both unmapped types derive the SAME fallback service alias ("widget"),
    // so with the same domain + grouping key they compose an identical prefix
    // `au.widget.shared`. Their field sets are DISJOINT (id+email vs name+member),
    // so neither key collides on `prefix.field` — the old per-key guard would let
    // both through and the consumer (which groups by prefix) would silently MERGE
    // them into ONE fabricated record. The prefix-ownership guard must catch this.
    const mgr = new CloudInfraOutput();
    const a = {
      id: out('a-id'),
      email: out('a@example.com'),
    } as unknown as OutputResource;
    const b = {
      name: out('b-name'),
      member: out('serviceAccount:b@example.com'),
    } as unknown as OutputResource;

    mgr.record('gcp:foo:Widget', 'shared', metaFor('au'), a);
    expect(() =>
      mgr.record('gcp:bar:Widget', 'shared', metaFor('au'), b)
    ).toThrow(/Flat-output prefix collision: the prefix 'au\.widget\.shared'/);
  });

  it('THROWS on a grouping key containing the separator (would corrupt the positional parse)', () => {
    const mgr = new CloudInfraOutput();
    const sa = { id: out('id') } as unknown as OutputResource;
    expect(() =>
      mgr.record('gcp:serviceaccount:Account', 'my.app', metaFor('au'), sa)
    ).toThrow(/Invalid flat-output name \(grouping key\) segment 'my\.app'/);
  });

  it('THROWS on a grouping key with whitespace/unicode (positive charset guard)', () => {
    const mgr = new CloudInfraOutput();
    const sa = { id: out('id') } as unknown as OutputResource;
    expect(() =>
      mgr.record('gcp:serviceaccount:Account', 'my app', metaFor('au'), sa)
    ).toThrow(/it must match/);
    const mgr2 = new CloudInfraOutput();
    expect(() =>
      mgr2.record('gcp:serviceaccount:Account', 'appé', metaFor('au'), sa)
    ).toThrow(/it must match/);
  });

  it('coerces a numeric Output (e.g. project number) to a string Output', () => {
    const mgr = new CloudInfraOutput();
    const project = {
      id: out('proj-id'),
      projectId: out('my-proj'),
      number: out(123456789),
    } as unknown as OutputResource;
    mgr.record('gcp:organizations:Project', 'host', metaFor('gl'), project);
    const flat = mgr.getFlatOutputs();
    expect(resolve(flat, 'gl.project.host.number')).toBe('123456789');
  });

  it('omits undefined optional fields', () => {
    const mgr = new CloudInfraOutput();
    const bucket = {
      id: out('b-id'),
      location: out('us-central1'),
    } as unknown as OutputResource;
    mgr.record('gcp:storage:Bucket', 'archive', metaFor('us', 'us-central1'), bucket);
    const keys = Object.keys(mgr.getFlatOutputs());
    expect(keys.some(k => k.endsWith('.email'))).toBe(false);
    expect(keys.some(k => k.endsWith('.member'))).toBe(false);
  });

  it('the nested format is unchanged by the dual-emit', () => {
    const mgr = new CloudInfraOutput();
    const sa = {
      id: out('sa-id'),
      email: out('sa-email'),
    } as unknown as OutputResource;

    mgr.record('gcp:serviceaccount:Account', 'my-app', metaFor('au'), sa);

    expect(mgr.getOutputs()).toEqual({
      au: {
        'gcp:serviceaccount:Account': {
          'my-app': { id: sa.id, email: sa.email },
        },
      },
    });
  });
});
