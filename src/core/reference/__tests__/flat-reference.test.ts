/**
 * Move 4 — flat reader mode on CloudInfraReference.
 *
 * Constructing a reference with `{ flat: true }` resolves `get()` / `all()`
 * against the NEW flat `FlatOutputRecord[]` wire emitted by
 * `CloudInfraOutput.getFlatOutputs()`, instead of the nested
 * `root[domain][type][name]` wire. These tests pin that:
 *   - a record resolves by `key`, and its `.id`/`.email`/`.identifier` match
 *     the values a nested reader would surface for the same record;
 *   - collisions disambiguate via `{ type }` (cross-record scan semantics);
 *   - `getIdentifier` stays byte-identical (F4) in both flat-with-domain and
 *     flat-without-domain shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable mock StackReference. `getOutput(...).apply(fn)` runs `fn`
// against the flat wire; `resolveFlat` returns a single record, and
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

// Flat wire: a self-describing FlatOutputRecord[] (post-JSON, plain strings).
const FLAT_WIRE = [
  {
    key: 'my-app',
    type: 'gcp:serviceaccount:Account',
    domain: 'au',
    id: 'proj/sa/my-app',
    name: 'my-app-sa',
    email: 'my-app@proj.iam.gserviceaccount.com',
    member: 'serviceAccount:my-app@proj.iam.gserviceaccount.com',
  },
  {
    key: 'collision',
    type: 'gcp:serviceaccount:Account',
    domain: 'au',
    id: 'sa-collision-id',
    email: 'collision@proj.iam.gserviceaccount.com',
  },
  {
    key: 'collision',
    type: 'gcp:storage:Bucket',
    domain: 'au',
    id: 'bucket-collision-id',
    name: 'collision-bucket',
  },
];

describe('flat reader mode (Move 4)', () => {
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

  it('resolves a record by key; .id/.email/.identifier match the nested values', () => {
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

  it('cross-record scan resolves a key that exists under exactly one type', () => {
    expect(flatRef('au').get('my-app').email).toBe(
      'my-app@proj.iam.gserviceaccount.com'
    );
  });

  it('throws asking for { type } when a key is shared by multiple records', () => {
    const ref = flatRef('au');
    expect(() => ref.get('collision').id).toThrow(/is ambiguous/);
    expect(() => ref.get('collision').id).toThrow(/gcp:serviceaccount:Account/);
    expect(() => ref.get('collision').id).toThrow(/gcp:storage:Bucket/);
  });

  it('collision disambiguation by { type } (alias-resolved)', () => {
    const ref = flatRef('au');
    // Short alias "sa" → gcp:serviceaccount:Account.
    expect(ref.get('collision', { type: 'sa' }).id).toBe('sa-collision-id');
    // Short alias "bucket" → gcp:storage:Bucket.
    expect(ref.get('collision', { type: 'bucket' }).id).toBe(
      'bucket-collision-id'
    );
    expect(ref.get('collision', { type: 'bucket' }).name).toBe(
      'collision-bucket'
    );
  });

  it('throws not-found when the key matches no record', () => {
    expect(() => flatRef('au').get('nope').id).toThrow(
      /Resource 'nope' not found in flat outputs under domain 'au'\./
    );
  });

  it('lazy missing-field error mirrors the nested reader', () => {
    // The bucket "collision" record has no email.
    expect(() => flatRef('au').get('collision', { type: 'bucket' }).email).toThrow(
      "'email' not present on 'collision'"
    );
  });

  describe('domain scoping', () => {
    it('without a configured domain, scans across all domains and matches by key', () => {
      // No domain => domain filter is "any"; "my-app" still resolves uniquely.
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
      // Wrong domain => not found.
      expect(() => ref.get('my-app', { domain: 'us' }).id).toThrow(
        /not found in flat outputs under domain 'us'/
      );
    });
  });

  it('a per-lookup { domain } override wins over the configured domain', () => {
    // Reference configured for "us" (no records) → override back to "au".
    const usRef = flatRef('us');
    expect(usRef.get('my-app', { domain: 'au' }).email).toBe(
      'my-app@proj.iam.gserviceaccount.com'
    );
  });

  it('skips malformed (non-object) array elements during the scan', () => {
    mockStackRef.getOutput.mockImplementationOnce(() => {
      const malformed = [
        'not-an-object',
        null,
        {
          key: 'lonely',
          type: 'gcp:serviceaccount:Account',
          domain: 'au',
          email: 'lonely@proj.iam.gserviceaccount.com',
        },
      ];
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

  it('.raw strips inline addressing (key/type/domain) for cross-mode parity', () => {
    // `.raw` is the (mocked) pulumi.Output thenable; unwrap its single .apply
    // to inspect the resolved resource object.
    const rawOutput = flatRef('au').get('my-app').raw as unknown as {
      apply: (cb: (r: Record<string, unknown>) => unknown) => unknown;
    };
    rawOutput.apply(raw => {
      expect(raw.id).toBe('proj/sa/my-app');
      expect(raw.email).toBe('my-app@proj.iam.gserviceaccount.com');
      // Addressing fields must NOT leak into the resolved resource object.
      expect('key' in raw).toBe(false);
      expect('type' in raw).toBe(false);
      expect('domain' in raw).toBe(false);
      return raw;
    });
  });

  describe('all()', () => {
    it('returns every flat record with inline domain/type/name addressing', () => {
      const entries = flatRef('au').all() as unknown as Array<{
        domain?: string;
        type?: string;
        name: string;
        record: Record<string, unknown>;
      }>;
      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual(
        expect.objectContaining({
          domain: 'au',
          type: 'gcp:serviceaccount:Account',
          name: 'my-app',
        })
      );
      expect(entries).toContainEqual(
        expect.objectContaining({
          domain: 'au',
          type: 'gcp:storage:Bucket',
          name: 'collision',
        })
      );
    });

    it('all() record is stripped of addressing (matches nested all() shape)', () => {
      const entries = flatRef('au').all() as unknown as Array<{
        name: string;
        record: Record<string, unknown>;
      }>;
      const myApp = entries.find(e => e.name === 'my-app');
      expect(myApp?.record).toBeDefined();
      expect('key' in myApp!.record).toBe(false);
      expect('type' in myApp!.record).toBe(false);
      expect('domain' in myApp!.record).toBe(false);
      expect(myApp!.record.id).toBe('proj/sa/my-app');
    });
  });

  it('rejects a non-array flat wire with a helpful error', () => {
    mockStackRef.getOutput.mockImplementationOnce(() => ({
      apply: (fn: (raw: unknown) => unknown) => {
        const resolved = fn({ not: 'an array' });
        return Array.isArray(resolved)
          ? resolved
          : { apply: (cb: (r: unknown) => unknown) => cb(resolved) };
      },
    }));
    expect(() => flatRef('au').get('my-app').id).toThrow(
      /expected an array/
    );
  });
});
