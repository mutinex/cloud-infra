import * as pulumi from '@pulumi/pulumi';
import { MatrixPrincipalObject } from '../types/matrix-types';

/**
 * Named principal helpers.
 *
 * These are SUGAR: each one returns one of the EXISTING accepted principal
 * kinds (a literal member string / `pulumi.Output<string>`, or a
 * `MatrixPrincipalObject`) so it flows through the unchanged resolver chain
 * (string → output → matrix-object → resource) and produces byte-identical
 * members / IAM bindings to the raw form. They only add explicit intent at the
 * call site. The raw 4-kind union is still accepted for back-compat; these
 * helpers are the preferred way to express a principal.
 */

/**
 * Force a `serviceAccount:` member from a service-account email.
 *
 * - For a plain `string` email this returns the literal
 *   `serviceAccount:${email}` string, identical to writing that string inline
 *   (resolved by the string resolver: member = the string, identifier = the
 *   email local/domain part).
 * - For a `pulumi.Output<string>` email it returns
 *   `pulumi.interpolate\`serviceAccount:${email}\`` (an `Output`), identical to
 *   passing such an Output inline (resolved by the output resolver).
 *
 * Use this when you have a bare SA email and want to be explicit that it is a
 * service account, rather than relying on a pre-prefixed string.
 *
 * @param email - The service account email (string or Output).
 * @param identifierHint - Optional identifier hint, used only when `email` is an
 *   `Output` (mirrors the Output resolver's `__identifierHint`) so the Pulumi
 *   resource name stays readable.
 */
export function saMember(
  email: string,
  identifierHint?: string
): string;
export function saMember(
  email: pulumi.Output<string>,
  identifierHint?: string
): pulumi.Output<string>;
export function saMember(
  email: pulumi.Input<string>,
  identifierHint?: string
): pulumi.Input<string>;
export function saMember(
  email: pulumi.Input<string>,
  identifierHint?: string
): pulumi.Input<string> {
  if (typeof email === 'string') {
    // Identical to the inline literal `serviceAccount:${email}` string.
    return `serviceAccount:${email}`;
  }

  // Output email → interpolate, identical to passing the Output inline.
  const out = pulumi.interpolate`serviceAccount:${email}` as pulumi.Output<string> & {
    __identifierHint?: string;
  };
  if (identifierHint) {
    // Mirrors OutputPrincipalResolver's `__identifierHint` handling.
    out.__identifierHint = identifierHint;
  }
  return out;
}

/**
 * Literal IAM member passthrough.
 *
 * Returns the supplied member verbatim (e.g. `'group:devs@example.com'`,
 * `'user:alice@example.com'`, `'allUsers'`, `'serviceAccount:foo@bar'`). This
 * is exactly what the string / output resolver receives today, so it produces
 * an identical binding to writing the member inline. The helper exists to make
 * the call site read as an explicit member.
 *
 * @param value - A fully-formed IAM member string or `Output<string>`.
 */
export function member(value: string): string;
export function member(value: pulumi.Output<string>): pulumi.Output<string>;
export function member(value: pulumi.Input<string>): pulumi.Input<string>;
export function member(value: pulumi.Input<string>): pulumi.Input<string> {
  return value;
}

/**
 * Arguments for {@link ref}, a cross-stack principal reference.
 */
export interface RefArgs {
  /** The source stack (`organization/project/environment`). */
  stack: string;
  /** The resource/output key within the stack. */
  name: string;
  /** Optional reference domain (omit for the flat domain-optional lookup). */
  domain?: string;
  /**
   * Optional resource type (e.g. `'account'`, `'project'`, `'secret'`).
   * Defaults to `'account'` exactly as the matrix-object resolver does.
   */
  type?: string;
  /** Optional output-key version passed through to the reference. */
  version?: string;
}

/**
 * Cross-stack principal reference.
 *
 * Returns a {@link MatrixPrincipalObject} — the exact object the matrix-object
 * resolver already consumes — so resolution (and therefore the emitted member /
 * identifier / binding) is byte-identical to passing the object inline. `type`
 * maps to the object's `resourceType` field (default `'account'`).
 *
 * @param args - `{ stack, name, domain?, type?, version? }`.
 */
export function ref(args: RefArgs): MatrixPrincipalObject {
  return {
    stack: args.stack,
    name: args.name,
    domain: args.domain,
    resourceType: args.type ?? 'account',
    version: args.version,
  };
}
