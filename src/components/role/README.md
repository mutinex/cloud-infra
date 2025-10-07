# Custom IAM Role (`CloudInfraRole`)

> Part of **`@mutinex/cloud-infra`** – CloudInfra-friendly Pulumi helpers.
>
> Creates a **project-level** or **organization-level** custom IAM role and
> lets you build its permission set by combining:
>
> • explicit permissions (`permissions` array)
> • permissions inherited from existing roles (`roles` array – accepts built-in
> role names or `CloudInfraRole` instances)
> • an optional `excluded` list to subtract undesired permissions
>
> Unsupported or `NOT_SUPPORTED` permissions are filtered out automatically.
>
> The `excluded` array now supports **substring matching**. For example, providing `["setIamPolicy"]` will exclude any permission that contains that string, such as `iam.serviceAccounts.setIamPolicy` and `notebooks.schedules.setIamPolicy`.

---

## Quick reference

```ts
import { CloudInfraMeta, CloudInfraRole } from '@mutinex/cloud-infra';
```

---

## Real-World Examples

The following examples are based on actual production role management:

### 1. Organization Project Admin Role

```ts
import { CloudInfraMeta, CloudInfraRole } from '@mutinex/cloud-infra';

export const orgProjectAdminMeta = new CloudInfraMeta({
  name: 'project-admin',
  omitDomain: true,
});

export const orgProjectAdmin = new CloudInfraRole(orgProjectAdminMeta, {
  orgId: 'YOUR_ORGANIZATION_ID',
  title: 'YourCompany Project Admin',
  description: 'YourCompany Project Admin',
  roles: [
    'roles/artifactregistry.admin',
    'roles/bigquery.admin',
    'roles/cloudsql.admin',
    'roles/storage.admin',
    'roles/secretmanager.admin',
    'roles/iam.roleAdmin',
    'roles/iam.serviceAccountAdmin',
    'roles/iam.serviceAccountTokenCreator',
    'roles/serviceusage.serviceUsageAdmin',
    'roles/servicemanagement.admin',
    'roles/logging.admin',
    'roles/monitoring.admin',
    'roles/pubsub.admin',
    'roles/run.admin',
    'roles/compute.admin',
    'roles/compute.networkAdmin',
  ],
  excluded: [
    'setIamPolicy',
    'stackdriver.projects.edit',
    'tags.create',
    'tags.delete',
    'tags.update',
    'createTagBinding',
    'deleteTagBinding',
  ],
});
```

### 2. Organization Viewer Role

```ts
export const orgViewerMeta = new CloudInfraMeta({
  name: 'viewer',
  omitDomain: true,
});

export const orgViewer = new CloudInfraRole(orgViewerMeta, {
  orgId: 'YOUR_ORGANIZATION_ID',
  title: 'YourCompany Viewer',
  description: 'YourCompany Viewer',
  permissions: [
    'resourcemanager.folders.getIamPolicy',
    'storage.buckets.getIamPolicy',
    'artifactregistry.repositories.get',
  ],
  roles: [
    'roles/browser',
    'roles/iam.organizationRoleViewer',
    'roles/logging.privateLogViewer',
    'roles/logging.viewer',
    'roles/run.viewer',
  ],
  excluded: [
    'setIamPolicy',
    'stackdriver.projects.edit',
    'tags.create',
    'tags.delete',
    'tags.update',
    'createTagBinding',
    'deleteTagBinding',
  ],
});
```

### 3. Specialized IAM Policy Admin Role

```ts
export const orgIamPolicyAdminMeta = new CloudInfraMeta({
  name: 'iam-policy-admin',
  omitDomain: true,
});

export const orgIamPolicyAdmin = new CloudInfraRole(orgIamPolicyAdminMeta, {
  orgId: 'YOUR_ORGANIZATION_ID',
  title: 'YourCompany IAM Policy Admin',
  description: 'YourCompany IAM Policy Admin',
  roles: ['roles/browser'],
  permissions: [
    'accesscontextmanager.policies.setIamPolicy',
    'aiplatform.endpoints.setIamPolicy',
    'artifactregistry.repositories.setIamPolicy',
    'bigquery.datasets.setIamPolicy',
    'cloudfunctions.functions.setIamPolicy',
    'cloudkms.cryptoKeys.setIamPolicy',
    'compute.instances.setIamPolicy',
    'iam.serviceAccounts.setIamPolicy',
    'pubsub.topics.setIamPolicy',
    'resourcemanager.projects.setIamPolicy',
    'run.services.setIamPolicy',
    'secretmanager.secrets.setIamPolicy',
    'storage.buckets.setIamPolicy',
    // ... many more setIamPolicy permissions
  ],
});
```

### 4. Organization Provisioner Role

```ts
export const orgOrganizationProvisionerMeta = new CloudInfraMeta({
  name: 'organization-provisioner',
  omitDomain: true,
});

export const orgOrganizationProvisioner = new CloudInfraRole(
  orgOrganizationProvisionerMeta,
  {
    orgId: 'YOUR_ORGANIZATION_ID',
    title: 'YourCompany Organization Provisioner',
    description: 'YourCompany Organization Provisioner',
    permissions: [
      'resourcemanager.tagValueBindings.create',
      'resourcemanager.tagValueBindings.delete',
    ],
    roles: [
      'roles/resourcemanager.organizationAdmin',
      'roles/resourcemanager.tagAdmin',
      'roles/resourcemanager.projectIamAdmin',
      'roles/resourcemanager.folderIamAdmin',
      'roles/resourcemanager.projectCreator',
      'roles/resourcemanager.projectMover',
      'roles/resourcemanager.folderAdmin',
      'roles/serviceusage.serviceUsageAdmin',
      'roles/privilegedaccessmanager.admin',
      'roles/iam.roleAdmin',
      'roles/iam.serviceAccountAdmin',
      'roles/iam.workloadIdentityPoolAdmin',
      'roles/pubsub.admin',
      'roles/artifactregistry.admin',
      'roles/artifactregistry.repoAdmin',
    ],
  }
);
```

### Key Production Patterns

1. **Organization-Level Role Management**
   - All roles created at organization level for global visibility
   - Consistent exclusion patterns for security (no setIamPolicy, tag management)
   - Clear role hierarchy from viewer to admin

2. **Comprehensive Permission Sets**
   - Project admin role covers all major GCP services
   - IAM policy admin role has extensive setIamPolicy permissions
   - Organization provisioner role for infrastructure management

3. **Security Through Exclusions**
   - Systematic exclusion of sensitive permissions
   - Substring matching for permission exclusions (e.g., "setIamPolicy")
   - Prevention of tag manipulation and policy changes

4. **Role Specialization**
   - Separate roles for different access levels (viewer, admin, provisioner)
   - Specialized roles for specific functions (IAM policy management)
   - Clear descriptions and titles for governance

---

## Additional Examples

### 1. Project-level role inheriting built-in roles

```ts
const meta = new CloudInfraMeta({
  name: 'simple-folder-admin',
  omitPrefix: true,
});

export const folderAdmin = new CloudInfraRole(meta, {
  title: 'Simple Folder Admin',
  roles: [
    'roles/resourcemanager.folderIamAdmin',
    'roles/resourcemanager.folderAdmin',
  ],
});
```

### 2. Role inheriting from another `CloudInfraRole`

```ts
const meta = new CloudInfraMeta({ name: 'extended-invoker', omitPrefix: true });

export const extendedInvoker = new CloudInfraRole(meta, {
  projectId: pulumi.getProject(),
  title: 'Pub/Sub + Run Invoker',
  roles: [folderAdmin], // inherits perms from example 1
  permissions: ['run.jobs.invoke'], // add explicit perm
});
```

---

## Configuration fields

| Field         | Type                             | Required | Notes                                                                                                        |
| ------------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `title`       | `string`                         | ✔︎      | Human-readable role title.                                                                                   |
| `projectId`   | `string \| pulumi.Input<string>` | –        | Provide **either** `projectId` **or** `orgId` (but not both). Defaults to `gcp:project` config when omitted. |
| `orgId`       | `string`                         | –        | Organization-level role when set.                                                                            |
| `permissions` | `string[]`                       | –        | Explicit permissions to include.                                                                             |
| `roles`       | `(string \| CloudInfraRole)[]`   | –        | Roles to inherit permissions from.                                                                           |
| `excluded`    | `string[]`                       | –        | Permissions to remove after inheritance. Supports substring matching.                                        |
| `description` | `string`                         | –        | Optional description.                                                                                        |

The constructor validates that **only one** of `projectId` or `orgId` is provided.

---

## Runtime API

| Method                   | Returns                                           |
| ------------------------ | ------------------------------------------------- |
| `getRole()`              | Project or organization `IAMCustomRole` resource. |
| `getName()`              | `pulumi.Output<string>` – resource name.          |
| `getId()`                | `pulumi.Output<string>` – unique ID.              |
| `exportOutputs(manager)` | Records the role in `CloudInfraOutput`.           |

`CloudInfraRole` implements `toString()` via `Symbol.toPrimitive` so it can be
embedded directly in interpolations (e.g., `${role}` resolves to
`projects/my-proj/roles/myRole`).

---

## Behaviour notes

1. Permissions are fetched via `gcp.iam.getTestablePermissions` and filtered so
   unsupported permissions never make it into the final role.
2. When inheriting from other `CloudInfraRole` instances, permissions are combined
   at deploy time; circular references throw a runtime error.

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraServiceAccount`](../account/README.md) – Service accounts that can be granted these roles
- [`CloudInfraAccessMatrix`](../../core/access-matrix/README.md) – IAM policy management using roles

### Organization Modules

- [`CloudInfraEntitlement`](../../organization/pam/README.md) – PAM entitlements that use custom roles
- [`CloudInfraServiceProject`](../../organization/project/README.md) – Projects where roles are created
- [`CloudInfraHostProject`](../../organization/project/README.md) – Host projects with role-based access
- [`CloudInfraWIPProvider`](../../organization/wip/README.md) – Workload Identity Pool role bindings

---

## See Also

- [GCP IAM Custom Roles](https://cloud.google.com/iam/docs/creating-custom-roles)
- [IAM Best Practices](https://cloud.google.com/iam/docs/using-iam-securely)
- [Service Account Management](../account/README.md)
- [Privileged Access Management](../../organization/pam/README.md)
- [Access Matrix Documentation](../../core/access-matrix/README.md)
