/**
 * Flat reader mode on CloudInfraReference (keyed-map wire).
 *
 * Constructing a reference with `{ flat: true }` resolves `get()` / `all()`
 * against the flat KEYED MAP emitted by `CloudInfraOutput.getFlatOutputs()`
 * (keys `<domain>.<service>[.<region>].<name>.<field>` → scalar string),
 * instead of the nested `root[domain][type][name]` wire. These tests pin that:
 *   - a record re-assembles by grouping keys that share the
 *     `<domain>.<service>[.<region>].<name>` prefix, and its
 *     `.id`/`.email`/`.identifier` match the values a nested reader would
 *     surface;
 *   - collisions disambiguate via `{ type }` (cross-record scan semantics);
 *   - `getIdentifier` stays byte-identical (F4) in both flat-with-domain and
 *     flat-without-domain shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable mock StackReference. `getOutput(...).apply(fn)` runs `fn`
// against the flat keyed map; `resolveFlat` returns a single record, and
// `buildRecord` chains a SECOND `.apply` over it (mimicking pulumi.Output).
// `all()` consumes the first `.apply` result (an array) directly.
const mockStackRef = {
  outputs: { apply: vi.fn() },
  getOutput: vi.fn(),
};

vi.mock('@pulumi/pulumi', () => ({
  Config: vi.fn(() => ({
    require: vi.fn((key: string) => `mock-${key}`),
  })),
  StackReference: vi.fn(() => mockStackRef),
}));

import { CloudInfraReference } from '../reference-manager';

// Flat wire: a keyed map `<domain>.<service>[.<region>].<name>.<field>` → string.
// - my-app: a GLOBAL service account (no region segment).
// - collision: a key shared by an SA and a (regional) bucket.
const FLAT_WIRE: Record<string, string> = {
  'au.sa.my-app.id': 'proj/sa/my-app',
  'au.sa.my-app.name': 'my-app-sa',
  'au.sa.my-app.email': 'my-app@proj.iam.gserviceaccount.com',
  'au.sa.my-app.member': 'serviceAccount:my-app@proj.iam.gserviceaccount.com',
  'au.sa.collision.id': 'sa-collision-id',
  'au.sa.collision.email': 'collision@proj.iam.gserviceaccount.com',
  'au.bucket.au-se1.collision.id': 'bucket-collision-id',
  'au.bucket.au-se1.collision.name': 'collision-bucket',
};

describe('flat reader mode (keyed map)', () => {
  beforeEach(() => {
    CloudInfraReference.clearCache();
    mockStackRef.getOutput.mockImplementation(() => ({
      apply: (fn: (raw: unknown) => unknown) => {
        const resolved = fn(FLAT_WIRE);
        if (Array.isArray(resolved)) {
          return resolved; // all()
        }
        return {
          apply: (cb: (r: unknown) => unknown) => cb(resolved),
        };
      },
    }));
  });

  const flatRef = (domain?: string) =>
    new CloudInfraReference('mutiny-group/foundation/prd', {
      domain,
      flat: true,
      outputKey: 'cloud-infra',
    });

  it('re-assembles a record by key prefix; .id/.email/.name/.member match', () => {
    const ref = flatRef('au');
    const rec = ref.get('my-app');
    expect(rec.id).toBe('proj/sa/my-app');
    expect(rec.email).toBe('my-app@proj.iam.gserviceaccount.com');
    expect(rec.name).toBe('my-app-sa');
    expect(rec.member).toBe(
      'serviceAccount:my-app@proj.iam.gserviceaccount.com'
    );
    // F4 identifier (domain form), byte-identical to the nested reader.
    expect(rec.identifier).toBe('foundation-my-app-prd-au');
    expect(rec.identifier).toBe(ref.getIdentifier('my-app'));
  });

  it('cross-record scan resolves a key that exists under exactly one service', () => {
    expect(flatRef('au').get('my-app').email).toBe(
      'my-app@proj.iam.gserviceaccount.com'
    );
  });

  it('throws asking for { type } when a key is shared by multiple records', () => {
    const ref = flatRef('au');
    expect(() => ref.get('collision').id).toThrow(/is ambiguous/);
    expect(() => ref.get('collision').id).toThrow(/service: 'sa'/);
    expect(() => ref.get('collision').id).toThrow(/service: 'bucket'/);
  });

  it('collision disambiguation by { type } (alias-resolved to a service)', () => {
    const ref = flatRef('au');
    // Short alias "sa" → service segment "sa".
    expect(ref.get('collision', { type: 'sa' }).id).toBe('sa-collision-id');
    // Short alias "bucket" → service segment "bucket".
    expect(ref.get('collision', { type: 'bucket' }).id).toBe(
      'bucket-collision-id'
    );
    expect(ref.get('collision', { type: 'bucket' }).name).toBe(
      'collision-bucket'
    );
    // Full Pulumi type also resolves to the right service.
    expect(
      ref.get('collision', { type: 'gcp:storage:Bucket' }).id
    ).toBe('bucket-collision-id');
  });

  it('throws not-found when the key matches no record', () => {
    expect(() => flatRef('au').get('nope').id).toThrow(
      /Resource 'nope' not found in flat outputs under domain 'au'\./
    );
  });

  it('lazy missing-field error mirrors the nested reader', () => {
    // The bucket "collision" record has no email.
    expect(() =>
      flatRef('au').get('collision', { type: 'bucket' }).email
    ).toThrow("'email' not present on 'collision'");
  });

  describe('domain scoping', () => {
    it('without a configured domain, scans across all domains and matches by key', () => {
      const ref = flatRef(undefined);
      expect(ref.get('my-app').email).toBe(
        'my-app@proj.iam.gserviceaccount.com'
      );
      // F4 domain-LESS identifier form (no trailing dash).
      expect(ref.get('my-app').identifier).toBe('foundation-my-app-prd');
      expect(ref.getIdentifier('my-app')).toBe('foundation-my-app-prd');
    });

    it('a per-lookup { domain } scopes the flat scan', () => {
      const ref = flatRef('au');
      expect(ref.get('my-app', { domain: 'au' }).id).toBe('proj/sa/my-app');
      expect(() => ref.get('my-app', { domain: 'us' }).id).toThrow(
        /not found in flat outputs under domain 'us'/
      );
    });
  });

  it('a per-lookup { domain } override wins over the configured domain', () => {
    const usRef = flatRef('us');
    expect(usRef.get('my-app', { domain: 'au' }).email).toBe(
      'my-app@proj.iam.gserviceaccount.com'
    );
  });

  it('skips malformed (wrong-arity) keys during grouping', () => {
    mockStackRef.getOutput.mockImplementationOnce(() => {
      const malformed = {
        'too.short': 'x',
        'a.b.c.d.e.f.too.long': 'y',
        'au.sa.lonely.email': 'lonely@proj.iam.gserviceaccount.com',
      };
      return {
        apply: (fn: (raw: unknown) => unknown) => {
          const resolved = fn(malformed);
          return Array.isArray(resolved)
            ? resolved
            : { apply: (cb: (r: unknown) => unknown) => cb(resolved) };
        },
      };
    });
    expect(flatRef('au').get('lonely').email).toBe(
      'lonely@proj.iam.gserviceaccount.com'
    );
  });

  it('.raw surfaces the re-assembled resource (no addressing leaks in)', () => {
    const rawOutput = flatRef('au').get('my-app').raw as unknown as {
      apply: (cb: (r: Record<string, unknown>) => unknown) => unknown;
    };
    rawOutput.apply(raw => {
      expect(raw.id).toBe('proj/sa/my-app');
      expect(raw.email).toBe('my-app@proj.iam.gserviceaccount.com');
      // Only resource fields are present — no key/type/domain addressing.
      expect('key' in raw).toBe(false);
      expect('type' in raw).toBe(false);
      expect('domain' in raw).toBe(false);
      return raw;
    });
  });

  describe('all()', () => {
    it('returns every grouped record with domain/service(type)/name addressing', () => {
      const entries = flatRef('au').all() as unknown as Array<{
        domain?: string;
        type?: string;
        name: string;
        record: Record<string, unknown>;
      }>;
      // my-app (sa) + collision (sa) + collision (bucket) = 3 groups.
      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual(
        expect.objectContaining({
          domain: 'au',
          type: 'sa',
          name: 'my-app',
        })
      );
      expect(entries).toContainEqual(
        expect.objectContaining({
          domain: 'au',
          type: 'bucket',
          name: 'collision',
        })
      );
    });

    it('all() record contains only resource fields', () => {
      const entries = flatRef('au').all() as unknown as Array<{
        name: string;
        record: Record<string, unknown>;
      }>;
      const myApp = entries.find(e => e.name === 'my-app');
      expect(myApp?.record).toBeDefined();
      expect(myApp!.record.id).toBe('proj/sa/my-app');
      expect('key' in myApp!.record).toBe(false);
    });
  });

  it('rejects a non-object flat wire with a helpful error', () => {
    mockStackRef.getOutput.mockImplementationOnce(() => ({
      apply: (fn: (raw: unknown) => unknown) => {
        const resolved = fn(['not', 'a', 'map']);
        return Array.isArray(resolved)
          ? resolved
          : { apply: (cb: (r: unknown) => unknown) => cb(resolved) };
      },
    }));
    // An array IS returned to all()/apply, but get() must reject it.
    expect(() => flatRef('au').get('my-app').id).toThrow(
      /expected a keyed object/
    );
  });
});
