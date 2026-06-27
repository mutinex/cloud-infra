/**
 * Move 4 — flat self-describing outputs (producer dual-emit).
 *
 * `CloudInfraOutput.record(...)` keeps writing the legacy nested
 * `data[domain][resourceType][groupingKey]` map AND now also appends a flat
 * `FlatOutputRecord` to a parallel collection exposed via `getFlatOutputs()`.
 * These tests pin that the flat records carry the SAME field VALUES as the
 * nested entries (same allow-list), with the addressing (`key`/`type`/`domain`)
 * surfaced inline. The nested format must stay byte-unchanged.
 *
 * `buildResourceEntry` copies Pulumi `Output` fields by REFERENCE, so the tests
 * use plain sentinel objects cast to the expected types and assert reference
 * identity — no Pulumi runtime is required.
 */
import { describe, it, expect } from 'vitest';
import { CloudInfraOutput } from '../output-manager';
import type { OutputResource } from '../output-manager';
import type { CloudInfraMeta } from '../../meta';

// A meta stub — `record()` only calls `getDomain()`.
const metaFor = (domain: string): CloudInfraMeta =>
  ({ getDomain: () => domain }) as unknown as CloudInfraMeta;

// Sentinel "Output" values: identity is what we assert.
const out = (tag: string): never => ({ __out: tag }) as unknown as never;

describe('CloudInfraOutput.getFlatOutputs() — producer dual-emit (Move 4)', () => {
  it('appends one flat record per record() call, addressing inline', () => {
    const mgr = new CloudInfraOutput();

    const sa = {
      id: out('sa-id'),
      name: out('sa-name'),
      email: out('sa-email'),
      member: out('sa-member'),
    } as unknown as OutputResource;

    const bucket = {
      id: out('bucket-id'),
      name: out('bucket-name'),
    } as unknown as OutputResource;

    mgr.record('gcp:serviceaccount:Account', 'my-app', metaFor('au'), sa);
    mgr.record('gcp:storage:Bucket', 'archive', metaFor('us'), bucket);

    const flat = mgr.getFlatOutputs();
    expect(flat).toHaveLength(2);

    const [first, second] = flat;
    // Insertion order mirrors record() call order.
    expect(first.key).toBe('my-app');
    expect(first.type).toBe('gcp:serviceaccount:Account');
    expect(first.domain).toBe('au');
    expect(second.key).toBe('archive');
    expect(second.type).toBe('gcp:storage:Bucket');
    expect(second.domain).toBe('us');
  });

  it('flat record field VALUES are identical to the nested entry (same allow-list)', () => {
    const mgr = new CloudInfraOutput();

    const sa = {
      id: out('sa-id'),
      name: out('sa-name'),
      email: out('sa-email'),
      member: out('sa-member'),
      // A field NOT in the allow-list must not leak into either emission.
      bogus: out('bogus'),
    } as unknown as OutputResource;

    mgr.record('gcp:serviceaccount:Account', 'my-app', metaFor('au'), sa);

    const nested =
      mgr.getOutputs()['au']['gcp:serviceaccount:Account']['my-app'];
    const flatRec = mgr.getFlatOutputs()[0];

    // Same VALUES (by reference) for every allow-listed field.
    expect(flatRec.id).toBe(nested.id);
    expect(flatRec.name).toBe(nested.name);
    expect(flatRec.email).toBe(nested.email);
    expect(flatRec.member).toBe(nested.member);

    // Non-allow-listed field is dropped from both.
    expect(
      (nested as unknown as Record<string, unknown>).bogus
    ).toBeUndefined();
    expect((flatRec as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('omits undefined optional fields, exactly like the nested entry', () => {
    const mgr = new CloudInfraOutput();
    // Bucket has no email/member.
    const bucket = {
      id: out('b-id'),
      name: out('b-name'),
    } as unknown as OutputResource;

    mgr.record('gcp:storage:Bucket', 'archive', metaFor('au'), bucket);
    const flatRec = mgr.getFlatOutputs()[0];

    expect('email' in flatRec).toBe(false);
    expect('member' in flatRec).toBe(false);
    expect(flatRec.id).toBe(bucket.id);
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

  it('multi-entry components appear as multiple flat records (one per grouping key)', () => {
    // e.g. a NAT/secret-style component recording several grouping keys under
    // the same type — each record() call yields its own flat record.
    const mgr = new CloudInfraOutput();
    const a = { id: out('a') } as unknown as OutputResource;
    const b = { id: out('b') } as unknown as OutputResource;

    mgr.record('gcp:secretmanager:Secret', 'db-password', metaFor('au'), a);
    mgr.record('gcp:secretmanager:Secret', 'api-key', metaFor('au'), b);

    const keys = mgr.getFlatOutputs().map(r => r.key);
    expect(keys).toEqual(['db-password', 'api-key']);
  });
});
