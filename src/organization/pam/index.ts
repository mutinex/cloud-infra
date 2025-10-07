import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as z from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraRole } from '../../components/role';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';

/**
 * Library-specific extras for future extensibility. Empty for now but keeping
 * the schema consistent with other components.
 */
export const CloudInfraEntitlementExtrasSchema = z.object({}).passthrough();
export type CloudInfraEntitlementExtras = z.infer<
  typeof CloudInfraEntitlementExtrasSchema
>;

/**
 * Extended role binding type that accepts CloudInfraRole instances in addition to strings.
 */
export type CloudInfraEntitlementRoleBinding = Omit<
  gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccessGcpIamAccessRoleBinding,
  'role'
> & {
  role: pulumi.Input<string> | CloudInfraRole;
};

/**
 * Extended GCP IAM Access type with CloudInfraRole support and optional resourceType.
 */
export type CloudInfraEntitlementGcpIamAccess = Omit<
  gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccessGcpIamAccess,
  'roleBindings' | 'resourceType'
> & {
  roleBindings?: pulumi.Input<pulumi.Input<CloudInfraEntitlementRoleBinding>[]>;
  resourceType?: pulumi.Input<string>;
};

/**
 * Extended privileged access type with our custom GCP IAM Access.
 */
export type CloudInfraEntitlementPrivilegedAccess = Omit<
  gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccess,
  'gcpIamAccess'
> & {
  gcpIamAccess?: pulumi.Input<CloudInfraEntitlementGcpIamAccess>;
};

/**
 * User-facing configuration accepted by {@link CloudInfraEntitlement}. It is a
 * superset of Pulumi's native `EntitlementArgs`, allowing call-sites to omit
 * many properties that are automatically derived (location, entitlementId,
 * etc.). Also accepts CloudInfraRole instances in roleBindings.
 */
export type CloudInfraEntitlementConfig = Partial<
  Omit<
    gcp.privilegedaccessmanager.EntitlementArgs,
    'entitlementId' | 'location' | 'privilegedAccess'
  >
> & {
  location?: pulumi.Input<string>;
  privilegedAccess?: pulumi.Input<CloudInfraEntitlementPrivilegedAccess>;
};

/**
 * CloudInfra wrapper around `gcp.privilegedaccessmanager.Entitlement`.
 *
 * The component enforces the following opinionated defaults:
 *
 *  • `location` ⇒ "global" when the attached {@link CloudInfraMeta} domain is
 *    "gl" (the library default) **and** the caller did not override it.
 *
 *  • `privilegedAccess.gcpIamAccess.resource` is transparently prefixed with
 *    `//cloudresourcemanager.googleapis.com/` so the caller only needs to pass
 *    `/projects/my-project` (or similar) in the config.
 *
 *  • `privilegedAccess.gcpIamAccess.resourceType` defaults to
 *    `cloudresourcemanager.googleapis.com/Organization`.  Shorthand values
 *    "project" and "folder" are automatically normalised to their fully-qualified
 *    counterparts.
 *
 * The component follows the same contract as the rest of the library – it
 * expects a **single** `meta.name` value (arrays are not supported) and it
 * records itself via {@link CloudInfraOutput} for cross-stack referencing.
 */
export class CloudInfraEntitlement {
  /** Metadata helper used to derive names, regions, etc. */
  private readonly meta: CloudInfraMeta;
  /** Underlying Pulumi resource instance. */
  private readonly entitlement: gcp.privilegedaccessmanager.Entitlement;
  /** Validated grouping key used when exporting outputs. */
  private readonly inputName: string;

  /**
   * Creates a new Privileged Access Manager entitlement with CloudInfra defaults.
   *
   * @param meta   Instance of {@link CloudInfraMeta} used for naming/location.
   * @param cloudInfraConfig  Partial Pulumi args + optional extras. All fields
   *                       are optional – sensible defaults will be inferred.
   *
   * Behavioural highlights:
   * • `entitlementId` defaults to `meta.getName()`.
   * • `location` defaults to `global` when the domain is `gl`.
   * • `privilegedAccess.gcpIamAccess.*` is normalised via
   *   {@link transformPrivilegedAccess}.
   * • `approvalWorkflow.manualApprovals.*` is auto-filled via
   *   {@link transformApprovalWorkflow}.
   * • `requesterJustificationConfig` defaults to `{ unstructured: {} }`.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraEntitlementConfig = {}
  ) {
    CloudInfraLogger.info('Initializing PAM entitlement component', {
      component: 'pam-entitlement',
      operation: 'constructor',
    });

    this.meta = meta;

    // Ensure single-name usage – bulk creation is not supported for Entitlements.
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraEntitlement expects `meta.name` to be a single string.',
        'pam-entitlement',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    CloudInfraEntitlementExtrasSchema.parse(cloudInfraConfig);

    const args = {
      entitlementId: meta.getName(),
      ...cloudInfraConfig,
    } as gcp.privilegedaccessmanager.EntitlementArgs;

    if (args.location === undefined && meta.getDomain() === 'gl') {
      args.location = 'global';
    }

    if (args.privilegedAccess !== undefined) {
      const privilegedAccessConfig =
        args.privilegedAccess as gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccess;
      CloudInfraLogger.debug('Processing privileged access configuration', {
        component: 'pam-entitlement',
        operation: 'processPrivilegedAccess',
        meta: {
          hasGcpIamAccess: !!privilegedAccessConfig?.gcpIamAccess,
          location: args.location,
        },
      });
      CloudInfraEntitlement.transformPrivilegedAccess(args);
    }

    if (args.approvalWorkflow !== undefined) {
      CloudInfraEntitlement.transformApprovalWorkflow(args);
    }

    if (args.requesterJustificationConfig === undefined) {
      args.requesterJustificationConfig = {
        unstructured: {},
      } as gcp.types.input.privilegedaccessmanager.EntitlementRequesterJustificationConfig;
    }

    const componentName = meta.getName();

    this.entitlement = new gcp.privilegedaccessmanager.Entitlement(
      componentName,
      args
    );
  }

  /** Returns the underlying Pulumi entitlement resource. */
  public getEntitlement(): gcp.privilegedaccessmanager.Entitlement {
    return this.entitlement;
  }

  /** Convenience accessor for the entitlement ID (Output<string>). */
  public getId(): pulumi.Output<string> {
    return this.entitlement.id;
  }

  /** Returns the {@link CloudInfraMeta} instance attached to this component. */
  public getMeta(): CloudInfraMeta {
    return this.meta;
  }

  /**
   * Registers the entitlement with a {@link CloudInfraOutput} manager so it can
   * be referenced from other stacks via {@link CloudInfraReference}.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const groupingKey = this.inputName;
    manager.record(
      'gcp:privilegedaccessmanager:Entitlement',
      groupingKey,
      this.meta,
      this.entitlement
    );
  }

  /**
   * Normalises the `privilegedAccess` block.
   *
   * – Rewrites relative resource paths into fully-qualified CRMs.
   * – Converts `CloudInfraRole` instances to role name outputs.
   * – Derives `parent` from the resolved resource path when omitted.
   * – Expands shorthand `resourceType` values ("project", "folder", etc.).
   *
   * Called internally from the constructor; **not** intended for external use.
   */
  private static transformPrivilegedAccess(
    args: gcp.privilegedaccessmanager.EntitlementArgs
  ): void {
    const privilegedAccess = args.privilegedAccess;

    const isPlainObject =
      typeof privilegedAccess === 'object' &&
      privilegedAccess !== null &&
      !pulumi.Output.isInstance(privilegedAccess);

    if (!isPlainObject) {
      return;
    }

    const privilegedAccessConfig =
      privilegedAccess as gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccess;

    if (!privilegedAccessConfig.gcpIamAccess) {
      return;
    }

    const gcpIamAccessInput = privilegedAccessConfig.gcpIamAccess;

    // We need to work with the plain object form
    if (
      typeof gcpIamAccessInput === 'object' &&
      !pulumi.Output.isInstance(gcpIamAccessInput)
    ) {
      const gcpIamAccess =
        gcpIamAccessInput as gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccessGcpIamAccess;

      // Convert CloudInfraRole instances → role names
      if (
        gcpIamAccess.roleBindings &&
        Array.isArray(gcpIamAccess.roleBindings)
      ) {
        gcpIamAccess.roleBindings = gcpIamAccess.roleBindings.map(
          roleBindingInput => {
            if (
              typeof roleBindingInput === 'object' &&
              roleBindingInput !== null &&
              !pulumi.Output.isInstance(roleBindingInput)
            ) {
              const roleBinding =
                roleBindingInput as gcp.types.input.privilegedaccessmanager.EntitlementPrivilegedAccessGcpIamAccessRoleBinding;
              if (
                roleBinding.role &&
                roleBinding.role instanceof CloudInfraRole
              ) {
                return {
                  ...roleBinding,
                  role: roleBinding.role.getName(),
                };
              }
            }
            return roleBindingInput;
          }
        );
      }

      // Prefix resource path
      if (gcpIamAccess.resource !== undefined) {
        gcpIamAccess.resource = pulumi
          .output(gcpIamAccess.resource)
          .apply((resourcePath: string | undefined) => {
            if (resourcePath === undefined || resourcePath === null) {
              return resourcePath || '';
            }
            const resourceString = String(resourcePath);
            const crmPrefix = '//cloudresourcemanager.googleapis.com/';
            const trimmedPath = resourceString.replace(/^\/+/g, '');
            if (
              trimmedPath.startsWith('cloudresourcemanager.googleapis.com/')
            ) {
              return `//${trimmedPath}`;
            }
            if (trimmedPath.startsWith(crmPrefix.substring(2))) {
              return `//${trimmedPath}`;
            }
            return `${crmPrefix}${trimmedPath}`;
          });
      }

      // Derive parent from resource when absent
      if (args.parent === undefined && gcpIamAccess.resource !== undefined) {
        args.parent = pulumi
          .output(gcpIamAccess.resource)
          .apply((fullResourcePath: string | undefined) => {
            if (!fullResourcePath) return fullResourcePath || '';
            let trimmedPath = String(fullResourcePath).replace(/^\/\//, '');
            const apiPrefix = 'cloudresourcemanager.googleapis.com/';
            if (trimmedPath.startsWith(apiPrefix)) {
              trimmedPath = trimmedPath.slice(apiPrefix.length);
            }
            return trimmedPath;
          });
      }

      // Normalise resourceType
      const defaultResourceType =
        'cloudresourcemanager.googleapis.com/Organization';
      gcpIamAccess.resourceType = pulumi
        .output(gcpIamAccess.resourceType ?? defaultResourceType)
        .apply((resourceType: string) => {
          const lowerType = (resourceType || '').toLowerCase();
          if (lowerType === 'project') {
            return 'cloudresourcemanager.googleapis.com/Project';
          }
          if (lowerType === 'folder') {
            return 'cloudresourcemanager.googleapis.com/Folder';
          }
          if (
            lowerType === 'organization' ||
            lowerType === 'org' ||
            lowerType === ''
          ) {
            return defaultResourceType;
          }
          return resourceType;
        });

      privilegedAccessConfig.gcpIamAccess = gcpIamAccess;
    }

    args.privilegedAccess = privilegedAccessConfig;
  }

  /**
   * Applies sensible defaults to the `approvalWorkflow` block.
   *
   * – Sets `requireApproverJustification` to `true` if missing.
   * – When a step lacks `approverEmailRecipients`, copies them from
   *   `approvers.principals` and strips the `user:` / `group:` prefixes.
   *
   * Called internally from the constructor; **not** intended for external use.
   */
  private static transformApprovalWorkflow(
    args: gcp.privilegedaccessmanager.EntitlementArgs
  ): void {
    const approvalWorkflow = args.approvalWorkflow;
    const isPlainObject =
      typeof approvalWorkflow === 'object' &&
      approvalWorkflow !== null &&
      !pulumi.Output.isInstance(approvalWorkflow);

    if (!isPlainObject) {
      return;
    }

    const approvalWorkflowConfig =
      approvalWorkflow as gcp.types.input.privilegedaccessmanager.EntitlementApprovalWorkflow;

    if (!approvalWorkflowConfig.manualApprovals) {
      return;
    }

    const manualApprovalsInput = approvalWorkflowConfig.manualApprovals;

    if (
      typeof manualApprovalsInput === 'object' &&
      !pulumi.Output.isInstance(manualApprovalsInput)
    ) {
      const manualApprovals =
        manualApprovalsInput as gcp.types.input.privilegedaccessmanager.EntitlementApprovalWorkflowManualApprovals;

      // Default requireApproverJustification
      if (manualApprovals.requireApproverJustification === undefined) {
        manualApprovals.requireApproverJustification = true;
      }

      // Populate approverEmailRecipients
      if (manualApprovals.steps && Array.isArray(manualApprovals.steps)) {
        manualApprovals.steps = manualApprovals.steps.map(stepInput => {
          const isStepPlainObject =
            typeof stepInput === 'object' &&
            stepInput !== null &&
            !pulumi.Output.isInstance(stepInput);

          if (isStepPlainObject) {
            const approvalStep =
              stepInput as gcp.types.input.privilegedaccessmanager.EntitlementApprovalWorkflowManualApprovalsStep;

            if (
              approvalStep.approvers &&
              typeof approvalStep.approvers === 'object' &&
              !pulumi.Output.isInstance(approvalStep.approvers)
            ) {
              const stepApprovers =
                approvalStep.approvers as gcp.types.input.privilegedaccessmanager.EntitlementApprovalWorkflowManualApprovalsStepApprovers;

              if (
                approvalStep.approverEmailRecipients === undefined &&
                stepApprovers.principals &&
                Array.isArray(stepApprovers.principals)
              ) {
                approvalStep.approverEmailRecipients =
                  stepApprovers.principals.map(
                    (principal: pulumi.Input<string>) =>
                      pulumi
                        .output(principal)
                        .apply((principalString: string) =>
                          principalString.replace(/^(user:|group:)/, '')
                        )
                  );
              }
            }
          }
          return stepInput;
        });
      }

      approvalWorkflowConfig.manualApprovals = manualApprovals;
    }

    args.approvalWorkflow = approvalWorkflowConfig;
  }
}

export { CloudInfraEntitlement as Entitlement }; // Named re-export for symmetry
