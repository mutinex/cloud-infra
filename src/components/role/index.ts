import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

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
 * Name-first construction args for `CloudInfraRole` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the role config
 * ({@link CloudInfraRoleConfig}) into a single args object. The naming fields
 * are resolved into a `CloudInfraMeta` internally (identical `generateName`
 * output, Frozen Contract F1); the remaining fields are passed straight through
 * as the role config. The distribution over the project/org union is preserved.
 */
export type CloudInfraRoleArgs = NamingArgs & CloudInfraRoleConfig;

/** Pulumi type token for the custom IAM role component. */
export const ROLE_TYPE = 'cloud-infra:role:CloudInfraRole';

/**
 * Resolves the single component name from meta, throwing the component's
 * ValidationError (rather than meta's generic getName error) when an array
 * name is supplied. Used to compute the `super()` args before `this` exists.
 */
function resolveRoleName(meta: CloudInfraMeta): string {
  const candidateInputName = meta.getInputName();
  if (Array.isArray(candidateInputName)) {
    throw new ValidationError(
      'CloudInfraRole expects a single name.',
      'role',
      'constructor'
    );
  }
  return meta.getName();
}

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
export class CloudInfraRole extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly role:
    | gcp.projects.IAMCustomRole
    | gcp.organizations.IAMCustomRole;
  private readonly fullName: string;
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the role config are folded
   * into a single args object; the name is resolved into a `CloudInfraMeta`
   * internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraRoleArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraRole(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraRoleConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraRoleArgs | CloudInfraRoleConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // role config passed straight through.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: CloudInfraRoleConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraRoleArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      // `CloudInfraRoleConfig` is a discriminated union; the rest-spread of
      // `NamingArgs & (Project | Org)` loses the union narrowing, so a cast is
      // needed. It is sound — the four naming keys are disjoint from both union
      // members, so removing them leaves a structurally valid role config.
      cloudInfraConfig = rest as CloudInfraRoleConfig;
    } else {
      meta = nameOrMeta;
      cloudInfraConfig = argsOrConfig as CloudInfraRoleConfig;
    }

    const name = resolveRoleName(meta);

    // Register the component node. The custom-role child parents under `this`.
    // The generated NAME is unchanged (F1); roleId derives from it as before.
    super(ROLE_TYPE, name, name, { domain: meta.getDomain() }, opts);

    CloudInfraLogger.info('Initializing role component', {
      component: 'role',
      operation: 'constructor',
    });

    this.meta = meta;

    // `name` already validated as a single (non-array) input by resolveRoleName.
    this.inputName = meta.getInputName() as string;
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

      // Custom-role moves UNDER this component but was FLAT (root) in v1 →
      // childOpts() aliases it back to its old root-level URN for a
      // non-destructive migration. `gcp.organizations.IAMCustomRole` has NO
      // `labels` field → args are NOT passed through withLabels.
      this.role = new gcp.organizations.IAMCustomRole(
        name,
        args,
        this.childOpts()
      );
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

      // Same migration treatment as the org-level branch: childOpts() parents
      // under the component and aliases back to the old flat URN; no labels.
      this.role = new gcp.projects.IAMCustomRole(name, args, this.childOpts());
      this.fullName =
        pulumi.interpolate`projects/${projectId}/roles/${roleId}` as unknown as string;
    }

    this.registerOutputs({
      role: this.role,
    });
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
