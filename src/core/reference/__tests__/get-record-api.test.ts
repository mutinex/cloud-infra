import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable mock StackReference for the nested (domain) wire. `getOutput`
// returns a thenable-like `{ apply }` so the lazy `.apply(...)` chains in
// CloudInfraReference resolve eagerly within the test.
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

// Nested wire: root[domain][fullType][name] = ResourceOutput
const WIRE = {
  au: {
    'gcp:serviceaccount:Account': {
      'my-app': {
        id: 'proj/sa/my-app',
        name: 'my-app-sa',
        email: 'my-app@proj.iam.gserviceaccount.com',
        member: 'serviceAccount:my-app@proj.iam.gserviceaccount.com',
      },
      collision: {
        id: 'sa-collision-id',
        email: 'collision@proj.iam.gserviceaccount.com',
      },
    },
    'gcp:storage:Bucket': {
      collision: {
        id: 'bucket-collision-id',
        name: 'collision-bucket',
      },
    },
  },
};

describe('get().field record API (nested/domain wire)', () => {
  let ref: CloudInfraReference;

  beforeEach(() => {
    CloudInfraReference.clearCache();
    // Mimic pulumi.Output chaining: the first `.apply` resolves the raw wire.
    // `resolve()` (record/legacy path) chains a SECOND `.apply`, so wrap the
    // resolved resource in another thenable. `all()` consumes the first
    // `.apply` result directly (an array), so return arrays unwrapped.
    mockStackRef.getOutput.mockImplementation(() => ({
      apply: (fn: (raw: unknown) => unknown) => {
        const resolved = fn(WIRE);
        if (Array.isArray(resolved)) {
          return resolved;
        }
        return {
          apply: (cb: (r: unknown) => unknown) => cb(resolved),
        };
      },
    }));
    ref = new CloudInfraReference('mutiny-group/foundation/prd', {
      domain: 'au',
      outputKey: 'cloud-infra',
    });
  });

  it('get("my-app").email matches deprecated getEmail', () => {
    const viaRecord = ref.get('my-app', { type: 'sa' }).email;
    const viaLegacy = ref.getEmail('sa', 'my-app');
    expect(viaRecord).toBe('my-app@proj.iam.gserviceaccount.com');
    expect(viaRecord).toBe(viaLegacy);
  });

  it('get("my-app").id matches deprecated getId', () => {
    const viaRecord = ref.get('my-app', { type: 'sa' }).id;
    const viaLegacy = ref.getId('sa', 'my-app');
    expect(viaRecord).toBe('proj/sa/my-app');
    expect(viaRecord).toBe(viaLegacy);
  });

  it('get("my-app").name matches deprecated getName', () => {
    expect(ref.get('my-app', { type: 'sa' }).name).toBe(
      ref.getName('sa', 'my-app')
    );
  });

  it('get("my-app").member matches deprecated getMember', () => {
    expect(ref.get('my-app', { type: 'sa' }).member).toBe(
      ref.getMember('sa', 'my-app')
    );
  });

  it('get("my-app").identifier is byte-identical to deprecated getIdentifier', () => {
    const viaRecord = ref.get('my-app', { type: 'sa' }).identifier;
    const viaLegacy = ref.getIdentifier('my-app');
    expect(viaRecord).toBe('foundation-my-app-prd-au');
    expect(viaRecord).toBe(viaLegacy);
  });

  describe('cross-type scan (no { type } given)', () => {
    it('resolves a name that exists under exactly one type', () => {
      // "my-app" lives only under gcp:serviceaccount:Account; the scan finds
      // exactly one match and returns it without needing a type.
      expect(ref.get('my-app').email).toBe(
        'my-app@proj.iam.gserviceaccount.com'
      );
      expect(ref.get('my-app').id).toBe('proj/sa/my-app');
    });

    it('throws asking for { type } when a name is shared by multiple types', () => {
      // "collision" exists under BOTH gcp:serviceaccount:Account and
      // gcp:storage:Bucket → the no-type scan must refuse to guess.
      expect(() => ref.get('collision').id).toThrow(/is ambiguous/);
      expect(() => ref.get('collision').id).toThrow(
        /gcp:serviceaccount:Account/
      );
      expect(() => ref.get('collision').id).toThrow(/gcp:storage:Bucket/);
      // The hint echoes a real candidate type (copy-pasteable), not a
      // `<type>` placeholder.
      expect(() => ref.get('collision').id).toThrow(
        "get('collision', { type: 'gcp:serviceaccount:Account' })"
      );
    });
  });

  describe('collision disambiguation via { type }', () => {
    it('resolves the SA "collision" with type: sa', () => {
      expect(ref.get('collision', { type: 'sa' }).id).toBe(
        'sa-collision-id'
      );
    });

    it('resolves the bucket "collision" with type: bucket', () => {
      expect(ref.get('collision', { type: 'bucket' }).id).toBe(
        'bucket-collision-id'
      );
      expect(ref.get('collision', { type: 'bucket' }).name).toBe(
        'collision-bucket'
      );
    });
  });

  describe('lazy missing-field error', () => {
    it('throws a helpful error when a field is absent', () => {
      // The bucket "collision" record has no email.
      expect(() => ref.get('collision', { type: 'bucket' }).email).toThrow(
        "'email' not present on 'collision'"
      );
    });
  });

  describe('domain override per lookup', () => {
    it('honors { domain } to override the configured domain', () => {
      // Reference configured for a different domain; override back to "au".
      const usRef = new CloudInfraReference('mutiny-group/foundation/prd', {
        domain: 'us',
        outputKey: 'cloud-infra',
      });
      expect(usRef.get('my-app', { type: 'sa', domain: 'au' }).email).toBe(
        'my-app@proj.iam.gserviceaccount.com'
      );
    });
  });

  describe('not-found', () => {
    it('throws a not-found error when the name exists under no type', () => {
      expect(() => ref.get('does-not-exist').email).toThrow(
        "Resource 'does-not-exist' not found under domain 'au'."
      );
    });

    it('throws not-found with an explicit type that has no such name', () => {
      expect(() => ref.get('my-app', { type: 'bucket' }).id).toThrow(
        "Resource 'my-app' of type 'gcp:storage:Bucket' not found under domain 'au'."
      );
    });

    it('scan against a missing domain falls to not-found (does not mask)', () => {
      // WIRE only has an "au" domain; a reference scoped to "us" finds no type
      // map and must throw not-found rather than silently resolving.
      const usRef = new CloudInfraReference('mutiny-group/foundation/prd', {
        domain: 'us',
        outputKey: 'cloud-infra',
      });
      expect(() => usRef.get('my-app').email).toThrow(
        "Resource 'my-app' not found under domain 'us'."
      );
    });

    it('scan skips malformed (non-object) type entries', () => {
      // A non-object value under a type must be skipped by the guard, not
      // matched or throw. Here "lonely" exists only under the well-formed type.
      mockStackRef.getOutput.mockImplementationOnce(() => {
        const malformed = {
          au: {
            'gcp:bad:Type': 'oops-not-an-object',
            'gcp:serviceaccount:Account': {
              lonely: { email: 'lonely@proj.iam.gserviceaccount.com' },
            },
          },
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
      expect(ref.get('lonely').email).toBe(
        'lonely@proj.iam.gserviceaccount.com'
      );
    });
  });

  describe('laziness', () => {
    it('does not fetch the stack output until a field is consumed', () => {
      mockStackRef.getOutput.mockClear();
      const record = ref.get('my-app', { type: 'sa' });
      expect(mockStackRef.getOutput).not.toHaveBeenCalled();
      // Touching a field triggers the fetch.
      void record.email;
      expect(mockStackRef.getOutput).toHaveBeenCalled();
    });
  });

  describe('all()', () => {
    it('flattens the nested wire into { domain, type, name, record }', () => {
      const entries = ref.all() as unknown as Array<{
        domain?: string;
        type?: string;
        name: string;
        record: Record<string, unknown>;
      }>;
      // my-app + 2x collision (sa + bucket) = 3 entries.
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
  });
});
