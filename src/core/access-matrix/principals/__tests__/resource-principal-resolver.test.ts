import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { ResourcePrincipalResolver } from '../principal-types';
import type { ResourcePrincipal } from '../../types/matrix-types';

/**
 * Regression coverage for the [HIGH BUG] fix in `ResourcePrincipalResolver`.
 *
 * Before the fix, `resolve` emitted `serviceAccount:${email}` for ANY resource
 * principal exposing `email`/`getEmail` — so a user/group-shaped resource
 * principal was silently mis-bound as a service account. The kind is now
 * resolved POSITIVELY:
 *   - a positively-identified service account keeps the byte-identical
 *     `serviceAccount:${email}` member, and
 *   - a non-SA resource principal must carry its own pre-formatted `member`
 *     (`user:` / `group:` / …), used verbatim, otherwise the resolver throws.
 *
 * These run against the REAL Pulumi/GCP runtime (no module mocks), so the SA
 * member assertion pins the actual emitted string byte-for-byte.
 */

async function memberString(member: pulumi.Input<string>): Promise<string> {
  return await new Promise<string>(resolve => {
    pulumi.output(member).apply(v => {
      resolve(v);
      return v;
    });
  });
}

describe('ResourcePrincipalResolver — positive kind resolution', () => {
  const resolver = new ResourcePrincipalResolver();

  describe('service-account principals (byte-identical SA path preserved)', () => {
    it('emits serviceAccount:${email} for a gcp.serviceaccount.Account instance', async () => {
      const sa = Object.create(
        gcp.serviceaccount.Account.prototype
      ) as gcp.serviceaccount.Account;
      Object.assign(sa, {
        email: 'svc@proj.iam.gserviceaccount.com',
        __name: 'svc',
      });

      const resolved = resolver.resolve(sa as unknown as ResourcePrincipal, 0);

      expect(await memberString(resolved.member)).toBe(
        'serviceAccount:svc@proj.iam.gserviceaccount.com'
      );
      expect(resolved.identifier).toBe('svc');
    });

    it('treats getServiceAccount()-bearing components as service accounts', async () => {
      const component: ResourcePrincipal = {
        getEmail: () => 'comp@proj.iam.gserviceaccount.com',
        getServiceAccount: () => ({}),
        meta: { getName: () => 'comp-sa' },
      };

      const resolved = resolver.resolve(component, 0);

      expect(await memberString(resolved.member)).toBe(
        'serviceAccount:comp@proj.iam.gserviceaccount.com'
      );
      expect(resolved.identifier).toBe('comp-sa');
    });

    it('honours an explicit principalKind:"serviceAccount" marker', async () => {
      const principal: ResourcePrincipal = {
        email: 'explicit@proj.iam.gserviceaccount.com',
        principalKind: 'serviceAccount',
        __name: 'explicit-sa',
      };

      const resolved = resolver.resolve(principal, 0);

      expect(await memberString(resolved.member)).toBe(
        'serviceAccount:explicit@proj.iam.gserviceaccount.com'
      );
    });
  });

  describe('non-service-account principals (the bug)', () => {
    it('resolves a user-shaped resource principal via its recorded member, NOT serviceAccount:', async () => {
      // Shaped like the legacy bug trigger: exposes email, but is a user.
      const userPrincipal: ResourcePrincipal = {
        email: 'alice@example.com',
        member: 'user:alice@example.com',
        __name: 'alice',
      };

      const resolved = resolver.resolve(userPrincipal, 0);

      const member = await memberString(resolved.member);
      expect(member).toBe('user:alice@example.com');
      expect(member.startsWith('serviceAccount:')).toBe(false);
    });

    it('resolves a group-shaped resource principal via getMember(), NOT serviceAccount:', async () => {
      const groupPrincipal: ResourcePrincipal = {
        getEmail: () => 'devs@example.com',
        getMember: () => 'group:devs@example.com',
        meta: { getName: () => 'devs-group' },
      };

      const resolved = resolver.resolve(groupPrincipal, 0);

      const member = await memberString(resolved.member);
      expect(member).toBe('group:devs@example.com');
      expect(member.startsWith('serviceAccount:')).toBe(false);
    });

    it('THROWS for a non-SA principal whose kind cannot be positively determined (never defaults to serviceAccount:)', () => {
      // email-only, no SA marker, no recorded member → must fail loud.
      const ambiguous: ResourcePrincipal = {
        email: 'mystery@example.com',
        __name: 'mystery',
      };

      expect(() => resolver.resolve(ambiguous, 0)).toThrow(
        /cannot positively determine its IAM kind/
      );
    });
  });
});
