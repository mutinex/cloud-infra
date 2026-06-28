import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';
import { CloudInfraRole } from '../../../components/role';

/**
 * Schema for matrix principal objects (from config)
 */
export const MatrixPrincipalObjectSchema = z.object({
  domain: z.string().optional(),
  stack: z.string(),
  version: z.string().optional(),
  resourceType: z.string().optional().default('account'),
  name: z.string(),
});

export type MatrixPrincipalObject = z.infer<typeof MatrixPrincipalObjectSchema>;

/**
 * Schema for literal principal strings
 */
export const MatrixPrincipalLiteralSchema = z.string();

export type MatrixPrincipalLiteral = z.infer<
  typeof MatrixPrincipalLiteralSchema
>;

/**
 * Union schema for all principal input types
 */
export const MatrixPrincipalSchema = z.union([
  MatrixPrincipalLiteralSchema,
  MatrixPrincipalObjectSchema,
]);

export type MatrixPrincipalInput = z.infer<typeof MatrixPrincipalSchema>;

/**
 * Interface for resource-based principals (service accounts, etc.)
 *
 * A resource principal is any object that can be turned into an IAM `member`
 * string. Historically this only covered service accounts (anything exposing
 * `email` / `getEmail`), and was unconditionally bound as `serviceAccount:…`.
 * That mis-bound non-SA resource principals; see
 * {@link ResourcePrincipalResolver}. The kind is now resolved POSITIVELY:
 *  - a service account (instance / `getServiceAccount()` / explicit kind marker)
 *    keeps the byte-identical `serviceAccount:${email}` member, OR
 *  - a recorded `member` / `getMember()` carries its own (`user:`, `group:`, …)
 *    prefix and is used verbatim.
 * If neither holds the resolver throws (fail loud) rather than defaulting to SA.
 */
export interface ResourcePrincipal {
  email?: pulumi.Input<string>;
  getEmail?(): pulumi.Input<string>;
  /**
   * Pre-formatted IAM member string (carries its own prefix, e.g. `user:…`,
   * `group:…`, `serviceAccount:…`). When present on a non-service-account
   * resource principal this is used verbatim as the member.
   */
  member?: pulumi.Input<string>;
  getMember?(): pulumi.Input<string>;
  /**
   * Returns the GCP service account this resource principal wraps. Presence of
   * this method is a POSITIVE marker that the principal is a service account.
   */
  getServiceAccount?(): unknown;
  /**
   * Explicit kind marker for the IAM member prefix (e.g. `serviceAccount`,
   * `user`, `group`, `domain`, `principal`, `principalSet`). When set it is
   * authoritative.
   */
  principalKind?: string;
  getName?(): string;
  meta?: {
    getName?(): string;
  };
  name?: pulumi.Input<string>;
  __name?: string;
  _name?: string;
  __pulumiResourceName?: string;
  __opts?: {
    name?: string;
  };
}

/**
 * Extended Output type with hint properties for better identification
 */
export interface OutputPrincipalWithHints extends pulumi.Output<string> {
  __identifierHint?: string;
  resources?: Array<{
    _name?: string;
    __name?: string;
    urn?: {
      name?: string;
    };
  }>;
}

/**
 * Union type for all possible principal inputs
 */
export type AllPrincipalTypes =
  | string
  | pulumi.Output<string>
  | MatrixPrincipalObject
  | ResourcePrincipal
  | undefined;

/**
 * Interface for bulk resources that can expand to multiple sub-resources.
 *
 * NOTE on `isCloudInfraBulkResource`: the merged single `CloudInfraAccount` now
 * ALSO exposes `getAccounts()` (a single-entry record), so `getAccounts()` alone
 * is NO LONGER a reliable bulk signal. A genuine bulk arity sets this explicit
 * marker to `true`; `PrincipalFactory.expandPrincipals` uses it (plus a
 * `keys.length > 1` heuristic) to decide whether to expand. A single account is
 * therefore resolved through the WRAPPER path (byte-identical member +
 * identifier), exactly as before the single class gained `getAccounts()`.
 */
export interface BulkResource {
  getAccounts(): Record<string, unknown>;
  /** `true` ONLY on a genuine bulk (array-arity) component. */
  isCloudInfraBulkResource?: boolean;
}

/**
 * Union type for all possible resources (including bulk resources)
 */
export type MatrixResource = unknown | BulkResource;

/**
 * Role input type - can be string or CloudInfraRole instance
 */
export type MatrixRoleInput = pulumi.Input<string> | CloudInfraRole;

/**
 * A rule for applying a role to a resource for a set of principals.
 */
export interface MatrixPolicyRule {
  /** The resource to apply the policy rule to */
  resource: MatrixResource;

  /** The role to grant */
  role: MatrixRoleInput;

  /**
   * Optional inline principals for this specific rule. These augment principals
   * from the Pulumi config and the parent use case. Accepts:
   * • Literal IAM member strings ("serviceAccount:foo@bar")
   * • CloudInfraAccount instances or raw Pulumi resources exposing getEmail() / email
   * • CloudInfraBulkAccount – will be expanded to all contained accounts
   * • Individual account objects from a bulk component
   */
  principals?: AllPrincipalTypes | AllPrincipalTypes[];

  /**
   * Optional static label for naming the resulting Pulumi IAM resource.
   * This is useful when the role is a `pulumi.Output<string>` (e.g., from a
   * StackReference), which cannot be used in a Pulumi resource name directly.
   * A label like "project-admin-role" makes the Pulumi preview more readable.
   *
   * A manual `label` ALWAYS wins over any auto-derived label (see `autoLabel`).
   */
  label?: string;

  /**
   * OPT-IN (default `false`). When `true` AND no manual `label` is set AND the
   * `role` cannot produce a stable safe-role name at preview time (i.e. it is a
   * `pulumi.Output<string>` that would otherwise fall back to the opaque,
   * reorder-fragile `role-<ruleIndex>`), the access matrix derives a
   * DETERMINISTIC, REORDER-STABLE safe-role segment instead.
   *
   * The derived value is computed from the resource component name plus a stable
   * role hint ({@link roleHint} when provided, otherwise a stable hash of the
   * role reference) — NEVER from the rule's array position — so reordering rules
   * does not rename (and therefore does not destroy/recreate) the IAM binding.
   *
   * DEFAULT (`undefined`/`false`) is byte-identical to historical behavior: the
   * `role-<ruleIndex>` fallback is preserved. Opting in is a conscious, one-time
   * migration for the consuming stack.
   */
  autoLabel?: boolean;

  /**
   * Optional stable hint for the role, used ONLY by the {@link autoLabel} path
   * when the role is an opaque `pulumi.Output<string>`. Mirrors the principal
   * `__identifierHint` mechanism: a human-meaningful, stable token (e.g.
   * `"org-project-admin"`) that names the role across reorders. When omitted and
   * `autoLabel` is on, a stable hash of the role reference is used instead.
   *
   * Ignored entirely when `autoLabel` is off, when a manual `label` is set, or
   * when the role already yields a stable name (string / `CloudInfraRole`).
   */
  roleHint?: string;
}

/**
 * Use case configuration with optional case-level principals.
 *
 * This `{ principals?, rules }` object is the CANONICAL, documented shape for a
 * use case. Prefer it. The bare-`MatrixPolicyRule[]` array form is still parsed
 * at runtime (see {@link MatrixUseCaseInput} and `normalizeUseCase`) for
 * backward compatibility, but is no longer the taught type.
 */
export interface MatrixUseCase {
  /**
   * Optional principals that apply to ALL policy rules in this use case.
   * These are combined with any inline principals specified on individual rules.
   */
  principals?: AllPrincipalTypes | AllPrincipalTypes[];

  /** The policy rules for this use case */
  rules: MatrixPolicyRule[];
}

/**
 * Flexible use case input accepted AT RUNTIME — either the canonical
 * {@link MatrixUseCase} object or, for back-compat, a bare array of
 * {@link MatrixPolicyRule}. `normalizeUseCase` collapses both to a
 * `MatrixUseCase` before processing.
 *
 * New code should use the {@link MatrixUseCase} object form. This wider union
 * exists only so existing array-form callers keep type-checking.
 */
export type MatrixUseCaseInput = MatrixPolicyRule[] | MatrixUseCase;

/**
 * A map of use case names to use case inputs — the historically-public, WIDE
 * type. Values may be the canonical {@link MatrixUseCase} object OR, for
 * back-compat, a bare {@link MatrixPolicyRule} array.
 *
 * This name is kept WIDE deliberately: it was public before the access-matrix
 * rework and consumers annotate their `cases` with it while passing a bare-array
 * case. Narrowing it to object-only would be a SOURCE-BREAKING change. The
 * constructor accepts this wide type. New code is TAUGHT the object form via the
 * README and the narrower {@link AccessMatrixCasesStrict} alias, but the type
 * itself stays wide for back-compat.
 */
export type AccessMatrixCases = Record<string, MatrixUseCaseInput>;

/**
 * Strict, object-only map of use case names to CANONICAL {@link MatrixUseCase}
 * objects (`{ principals?, rules }`). This is the TAUGHT shape for new code; it
 * is a separate, narrower alias so {@link AccessMatrixCases} can stay WIDE for
 * back-compat. Annotate new `cases` with this to opt into the object-only form.
 */
export type AccessMatrixCasesStrict = Record<string, MatrixUseCase>;

/**
 * Back-compat input map alias (WIDE — same as {@link AccessMatrixCases}). Values
 * may be the canonical {@link MatrixUseCase} object OR a bare
 * {@link MatrixPolicyRule} array. The access-matrix constructor accepts this
 * wider type so existing array-form callers keep working; the documented/taught
 * type for new code is {@link AccessMatrixCasesStrict}.
 */
export type AccessMatrixCasesInput = Record<string, MatrixUseCaseInput>;

/**
 * Context for processing a single policy rule.
 */
export interface PolicyRuleProcessingContext {
  readonly caseName: string;
  readonly ruleIndex: number;
  readonly principalIndex: number;
  readonly configPrincipals: unknown[];
}
