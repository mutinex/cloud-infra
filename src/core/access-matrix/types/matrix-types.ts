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
 */
export interface ResourcePrincipal {
  email?: pulumi.Input<string>;
  getEmail?(): pulumi.Input<string>;
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
 * Flexible use case input - can be an array of policy rules or a use case object.
 */
export type MatrixUseCaseInput = MatrixPolicyRule[] | MatrixUseCase;

/**
 * A map of use case names to their respective inputs.
 */
export type AccessMatrixCases = Record<string, MatrixUseCaseInput>;

/**
 * Information for a processed policy rule, ready for IAM resource creation.
 */
export interface ProcessedPolicyRule {
  readonly resource: MatrixResource;
  readonly role: MatrixRoleInput;
  readonly member: pulumi.Input<string>;
  readonly principalIdentifier: string;
  readonly label?: string;
  readonly resourceKey?: string;
}

/**
 * Context for processing a single policy rule.
 */
export interface PolicyRuleProcessingContext {
  readonly caseName: string;
  readonly ruleIndex: number;
  readonly principalIndex: number;
  readonly configPrincipals: unknown[];
}
