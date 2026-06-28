import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';
import { saMember, member, ref } from '../helpers';
import { PrincipalFactory } from '../principal-factory';
import { MatrixObjectPrincipalResolver } from '../principal-types';

/**
 * The named principal helpers are SUGAR — they must resolve to byte-identical
 * members / identifiers / bindings as the raw principal forms they replace.
 * These tests resolve the helper output through the REAL resolver chain and
 * compare against the equivalent raw form.
 */

async function memberString(m: pulumi.Input<string>): Promise<string> {
  return await new Promise<string>(resolve => {
    pulumi.output(m).apply(v => {
      resolve(v);
      return v;
    });
  });
}

describe('named principal helpers', () => {
  describe('saMember', () => {
    it('string email is identical to the inline serviceAccount: literal', async () => {
      const email = 'svc@proj.iam.gserviceaccount.com';

      const viaHelper = PrincipalFactory.resolvePrincipal(saMember(email), 0);
      const viaRaw = PrincipalFactory.resolvePrincipal(
        `serviceAccount:${email}`,
        0
      );

      expect(saMember(email)).toBe(`serviceAccount:${email}`);
      expect(await memberString(viaHelper.member)).toBe(
        await memberString(viaRaw.member)
      );
      expect(viaHelper.identifier).toBe(viaRaw.identifier);
    });

    it('Output email resolves to serviceAccount:${email} via the output resolver', async () => {
      const out = pulumi.output('out-svc@proj.iam.gserviceaccount.com');

      const resolved = PrincipalFactory.resolvePrincipal(
        saMember(out, 'out-svc'),
        0
      );

      expect(await memberString(resolved.member)).toBe(
        'serviceAccount:out-svc@proj.iam.gserviceaccount.com'
      );
      expect(resolved.identifier).toBe('out-svc');
    });
  });

  describe('member', () => {
    it('passes a literal member through verbatim (group/user/allUsers)', async () => {
      for (const literal of [
        'group:devs@example.com',
        'user:alice@example.com',
        'allUsers',
        'serviceAccount:svc@proj.iam.gserviceaccount.com',
      ]) {
        expect(member(literal)).toBe(literal);

        const viaHelper = PrincipalFactory.resolvePrincipal(member(literal), 0);
        const viaRaw = PrincipalFactory.resolvePrincipal(literal, 0);

        expect(await memberString(viaHelper.member)).toBe(
          await memberString(viaRaw.member)
        );
        expect(viaHelper.identifier).toBe(viaRaw.identifier);
      }
    });
  });

  describe('ref', () => {
    it('produces a MatrixPrincipalObject resolved identically to the inline object', () => {
      const resolver = new MatrixObjectPrincipalResolver();

      const refObj = ref({
        stack: 'organization/mtx/prd',
        name: 'keyOfMyAccount',
        type: 'account',
      });
      const rawObj = {
        stack: 'organization/mtx/prd',
        name: 'keyOfMyAccount',
        resourceType: 'account',
        domain: undefined,
        version: undefined,
      };

      // Both must be matched by the matrix-object resolver (resolver order intact).
      expect(resolver.canResolve(refObj)).toBe(true);
      expect(resolver.canResolve(rawObj)).toBe(true);

      // The constructed object equals the equivalent inline MatrixPrincipalObject.
      expect(refObj).toEqual(rawObj);
      expect(refObj.resourceType).toBe('account');
    });

    it('defaults type to "account" and carries domain when provided', () => {
      const withDomain = ref({
        stack: 'organization/mtx/uat',
        name: 'mtx-uat-run',
        domain: 'gl',
      });
      expect(withDomain.resourceType).toBe('account');
      expect(withDomain.domain).toBe('gl');
    });
  });
});
