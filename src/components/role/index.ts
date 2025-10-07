import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';

/**
 * Custom IAM **Role** component.
 *
 * Builds either a **project-level** (`gcp.projects.IAMCustomRole`) or
 * **organization-level** (`gcp.organizations.IAMCustomRole`) custom role based
 * on the presence of `orgId` in the configuration. Permissions can be
 * assembled from:
 *   • explicit strings in `permissions`
 *   • other roles (built-in, existing custom, or `CloudInfraRole` instances) via
 *     the `roles` array
 *   • optional `excluded` list to subtract permissions
 *
 * Unsupported or not-yet-GA permissions are automatically filtered out using
 * `gcp.iam.getTestablePermissions`.
 *
 * @packageDocumentation
 */

export type CloudInfraProjectRoleConfig = Omit<
  gcp.projects.IAMCustomRoleArgs,
  'project' | 'roleId' | 'permissions'
> & {
  projectId?: pulumi.Input<string>;
  permissions?: string[];
  excluded?: string[];
  roles?: Array<string | CloudInfraRole>;
};

export type CloudInfraOrgRoleConfig = Omit<
  gcp.organizations.IAMCustomRoleArgs,
  'orgId' | 'roleId' | 'permissions'
> & {
  orgId: string;
  permissions?: string[];
  excluded?: string[];
  roles?: Array<string | CloudInfraRole>;
};

export type CloudInfraRoleConfig =
  | CloudInfraProjectRoleConfig
  | CloudInfraOrgRoleConfig;

/**
 * High-level class that instantiates a custom IAM role and provides helpers
 * to reference its full name (project/organization path).
 *
 * @example Project-level role inheriting from built-in roles
 * ```ts
 * const meta = new CloudInfraMeta({ name: "simple-folder-admin", omitPrefix: true });
 * const role = new CloudInfraRole(meta, {
 *   title: "Simple Folder Admin",
 *   roles: ["roles/resourcemanager.folderAdmin"],
 * });
 * ```
 */
export class CloudInfraRole {
  private readonly meta: CloudInfraMeta;
  private readonly role:
    | gcp.projects.IAMCustomRole
    | gcp.organizations.IAMCustomRole;
  private readonly fullName: string;
  private readonly inputName: string;

  constructor(meta: CloudInfraMeta, cloudInfraConfig: CloudInfraRoleConfig) {
    CloudInfraLogger.info('Initializing role component', {
      component: 'role',
      operation: 'constructor',
    });

    this.meta = meta;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraRole expects a single name.',
        'role',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    const name = this.meta.getName();
    // Derive roleId by camel-casing the full component name
    const roleId = name
      .split('-')
      .map((part, idx) =>
        idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
      )
      .join('');

    const isOrgRole =
      'orgId' in cloudInfraConfig &&
      cloudInfraConfig.orgId !== undefined &&
      cloudInfraConfig.orgId !== '';

    const projectId: pulumi.Input<string> = isOrgRole
      ? undefined!
      : (('projectId' in cloudInfraConfig
          ? cloudInfraConfig.projectId
          : undefined) ?? meta.getGcpProject());

    const orgIdResolved =
      isOrgRole && 'orgId' in cloudInfraConfig
        ? cloudInfraConfig.orgId
        : undefined;

    const explicitPerms: string[] = cloudInfraConfig.permissions ?? [];
    const roleRefs = cloudInfraConfig.roles ?? [];

    const inheritedPermOutputs: pulumi.Output<string[]>[] = roleRefs.map(r => {
      if (typeof r === 'string') {
        // Lookup built-in or existing custom role via IAM data source
        return gcp.iam.getRuleOutput({ name: r }).includedPermissions;
      } else if (r instanceof CloudInfraRole) {
        return r.getRole().permissions;
      } else {
        throw new ValidationError(
          "Each item in 'roles' config must be a string or CloudInfraRole instance",
          'role',
          'constructor'
        );
      }
    });

    // Combine and filter permissions
    CloudInfraLogger.debug('Filtering permissions', {
      component: 'role',
      operation: 'constructor',
      meta: {
        totalPermissions: explicitPerms.length + roleRefs.length,
        excluded: cloudInfraConfig.excluded?.length || 0,
      },
    });

    const combinedPermissions = pulumi
      .all([...inheritedPermOutputs, explicitPerms])
      .apply((lists: string[][]) => {
        const excludedSubstrings = cloudInfraConfig.excluded ?? [];
        const resultSet = new Set<string>();
        for (const perms of lists) {
          for (const p of perms) {
            const isExcluded = excludedSubstrings.some(substring =>
              p.includes(substring)
            );
            if (!isExcluded) {
              resultSet.add(p);
            }
          }
        }
        return Array.from(resultSet);
      });

    const fullResourcePrefix = isOrgRole
      ? `//cloudresourcemanager.googleapis.com/organizations/${orgIdResolved}`
      : `//cloudresourcemanager.googleapis.com/projects/${projectId}`;

    const notSupportedPermsOutput = pulumi
      .output(
        gcp.iam.getTestablePermissions({
          fullResourceName: fullResourcePrefix,
          stages: ['GA', 'ALPHA', 'BETA'],
          customSupportLevel: 'NOT_SUPPORTED',
        })
      )
      .apply(res => res.permissions.map(p => p.name));

    const supportedPermsOutput = pulumi
      .output(
        gcp.iam.getTestablePermissions({
          fullResourceName: fullResourcePrefix,
          stages: ['GA', 'ALPHA', 'BETA'],
        })
      )
      .apply(res => res.permissions.map(p => p.name));

    const finalPermissions = pulumi
      .all([combinedPermissions, notSupportedPermsOutput, supportedPermsOutput])
      .apply(([perms, notSupported, supported]) => {
        const notSupportedSet = new Set(notSupported);
        const supportedSet = new Set(supported);
        return perms
          .filter(p => supportedSet.has(p) && !notSupportedSet.has(p))
          .sort();
      });

    // Create role directly inline
    if (isOrgRole && orgIdResolved) {
      const args: gcp.organizations.IAMCustomRoleArgs = {
        orgId: orgIdResolved,
        roleId: roleId,
        title: cloudInfraConfig.title,
        permissions: finalPermissions,
        ...(cloudInfraConfig.description && {
          description: cloudInfraConfig.description,
        }),
      };

      this.role = new gcp.organizations.IAMCustomRole(name, args);
      this.fullName = `organizations/${orgIdResolved}/roles/${roleId}`;
    } else {
      const args: gcp.projects.IAMCustomRoleArgs = {
        project: projectId,
        roleId: roleId,
        title: cloudInfraConfig.title,
        permissions: finalPermissions,
        ...(cloudInfraConfig.description && {
          description: cloudInfraConfig.description,
        }),
      };

      this.role = new gcp.projects.IAMCustomRole(name, args);
      this.fullName =
        pulumi.interpolate`projects/${projectId}/roles/${roleId}` as unknown as string;
    }
  }

  /** Underlying custom role resource. */
  public getRole():
    | gcp.projects.IAMCustomRole
    | gcp.organizations.IAMCustomRole {
    return this.role;
  }

  /** Resource name (projects/…/roles/… or organizations/…/roles/…). */
  public getName(): pulumi.Output<string> {
    return this.role.name;
  }

  /** Role ID (`projects/.../roles/<id>`). */
  public getId(): pulumi.Output<string> {
    return this.role.id;
  }

  /** Attached `CloudInfraMeta`. */
  public getMeta(): CloudInfraMeta {
    return this.meta;
  }

  /** Record outputs. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const groupingKey = this.inputName;
    const resourceType =
      this.role instanceof gcp.organizations.IAMCustomRole
        ? 'gcp:organizations:IAMCustomRole'
        : 'gcp:projects:IAMCustomRole';

    manager.record(resourceType, groupingKey, this.meta, this.role);
  }

  /** Allows interpolations like `${role}` to resolve to full name. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public [Symbol.toPrimitive](_hint: string): string {
    return this.fullName;
  }
}
