import { CloudInfraAccessMatrix } from './core/access-matrix';
import {
  AllPrincipalTypes,
  MatrixResource,
  MatrixRoleInput,
} from './types/matrix-types';

/**
 * Options for {@link grant}.
 */
export interface GrantOptions {
  /**
   * Static label for naming the resulting Pulumi IAM resource — passed through
   * verbatim as the policy rule's `label`. Recommended when `role` is a
   * `pulumi.Output<string>` so the Pulumi preview stays readable. Identical in
   * effect to setting `label` on a matrix policy rule.
   */
  label?: string;
  /**
   * Internal case name used for the single-rule matrix. Does NOT affect the
   * emitted IAM resource names (those are
   * `${componentName}:${safeRole}:${principalIdentifier}`) — it only labels log
   * lines. Defaults to `'grant'`.
   */
  caseName?: string;
}

/**
 * One-liner IAM grant — the access-matrix engine with a smaller hat.
 *
 * `grant(to, role, on, opts?)` builds a single-rule `CloudInfraAccessMatrix`
 * internally and returns it. It is exactly equivalent to:
 *
 * ```ts
 * new CloudInfraAccessMatrix({
 *   [opts?.caseName ?? 'grant']: {
 *     rules: [{ resource: on, role, principals: to, label: opts?.label }],
 *   },
 * });
 * ```
 *
 * Because it funnels through the same `PolicyRuleProcessor`, the emitted
 * `gcp.*IAMMember` type tokens, member strings, and logical resource names are
 * BYTE-IDENTICAL to the equivalent matrix case. This is intentionally the
 * single, centralized IAM path — it does NOT add IAM methods to resource
 * components.
 *
 * @param to - The principal(s) to grant access to. Accepts the same shapes as a
 *   rule's `principals` (literal member string, `pulumi.Output<string>`,
 *   cross-stack `MatrixPrincipalObject` / {@link import('./principals/helpers').ref},
 *   {@link import('./principals/helpers').saMember} /
 *   {@link import('./principals/helpers').member} output, a resource principal,
 *   or an array of any of these).
 * @param role - The role to grant (string, `pulumi.Output<string>`, or
 *   `CloudInfraRole`).
 * @param on - The GCP resource to grant access on (must be a type with a
 *   registered access-matrix handler).
 * @param opts - Optional `{ label?, caseName? }`.
 * @returns The constructed `CloudInfraAccessMatrix` (use `.getIamMembers()` /
 *   `.getPolicyRuleCount()` if you need the created resources).
 */
export function grant(
  to: AllPrincipalTypes | AllPrincipalTypes[],
  role: MatrixRoleInput,
  on: MatrixResource,
  opts?: GrantOptions
): CloudInfraAccessMatrix {
  return new CloudInfraAccessMatrix({
    [opts?.caseName ?? 'grant']: {
      rules: [
        {
          resource: on,
          role,
          principals: to,
          label: opts?.label,
        },
      ],
    },
  });
}
