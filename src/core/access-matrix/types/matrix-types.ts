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
 * Interface for bulk resources that can expand to multiple sub-resources
 */
export interface BulkResource {
  getAccounts(): Record<string, unknown>;
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
   */
  label?: string;
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
 * A map of use case names to their CANONICAL use case objects.
 *
 * This is the taught type: one shape, `{ principals?, rules }`. For the
 * back-compat surface that still accepts the bare-array form at runtime, see
 * {@link AccessMatrixCasesInput}.
 */
export type AccessMatrixCases = Record<string, MatrixUseCase>;

/**
 * Back-compat input map: values may be the canonical {@link MatrixUseCase}
 * object OR a bare {@link MatrixPolicyRule} array. The access-matrix constructor
 * accepts this wider type so existing array-form callers keep working; the
 * documented/taught type for new code is {@link AccessMatrixCases}.
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
