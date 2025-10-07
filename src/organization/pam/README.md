# CloudInfraEntitlement

A high-level wrapper around `gcp.privilegedaccessmanager.Entitlement` that applies CloudInfra conventions and sensible defaults.

## Features

- **Name / ID generation** – `entitlementId` defaults to [`CloudInfraMeta.getName()`](../../core/meta/README.md).
- **Location defaulting** – `location` is set to `global` when the domain is `gl` (the default).
- **Resource path normalisation** – relative paths like `/projects/my-proj` are automatically prefixed with `//cloudresourcemanager.googleapis.com/`.
- **Resource-type mapping** – shorthand values (`"project"`, `"folder"`) expand to fully-qualified Cloud Resource Manager (CRM) type strings.
- **Parent derivation** – if `parent` is omitted it is derived from the resolved resource path.
- **Role binding helper** – [`CloudInfraRole`](../../components/role/README.md) instances can be used directly inside `roleBindings`.
- **Approval workflow defaults**
  - `requireApproverJustification` ⇒ `true`.
  - `approverEmailRecipients` ⇒ copied from `approvers.principals` (prefixes stripped).
- **Requester justification** – defaults to `{ unstructured: {} }`.
- **Output registration** – automatically recorded via [`CloudInfraOutput`](../../core/output/README.md) for cross-stack consumption.

---

## Quick Example

```ts
import {
  CloudInfraMeta,
  CloudInfraEntitlement,
  CloudInfraRole,
} from '@mutinex/cloud-infra';

const roleMeta = new CloudInfraMeta({ name: 'support', omitDomain: true });
const supportRole = new CloudInfraRole(roleMeta, {
  projectId: 'my-proj',
  title: 'Support',
  permissions: ['resourcemanager.projects.get'],
});

const entitlementMeta = new CloudInfraMeta({
  name: 'support',
  omitDomain: true,
});

const entitlement = new CloudInfraEntitlement(entitlementMeta, {
  maxRequestDuration: '3600s',
  privilegedAccess: {
    gcpIamAccess: {
      roleBindings: [{ role: supportRole }],
      resource: '/projects/my-proj',
      resourceType: 'project',
    },
  },
  approvalWorkflow: {
    manualApprovals: {
      steps: [
        {
          approvalsNeeded: 1,
          approvers: { principals: ['user:admin@example.com'] },
        },
      ],
    },
  },
});
```

---

## Real-World Examples

The following examples are based on actual usage patterns from production infrastructure:

### 1. Project-Level IAM Policy Admin (Auto-Approval)

```ts
import {
  CloudInfraMeta,
  CloudInfraEntitlement,
} from '@mutinex/cloud-infra';
import { orgIamPolicyAdmin } from './roles';
import { orgDevId } from './refs';

const orgDevIamPolicyAdminEntitlementMeta = new CloudInfraMeta({
  name: 'org-dev-iam-policy-admin',
  omitDomain: true,
  omitPrefix: true,
});

export const orgDevIamPolicyAdminEntitlement = new CloudInfraEntitlement(
  orgDevIamPolicyAdminEntitlementMeta,
  {
    maxRequestDuration: '7200s',
    eligibleUsers: [
      {
        principals: ['group:group@your-domain.com'],
      },
    ],
    privilegedAccess: {
      gcpIamAccess: {
        roleBindings: [
          {
            role: orgIamPolicyAdmin,
          },
        ],
        resource: orgDevId,
        resourceType: 'project',
      },
    },
    additionalNotificationTargets: {
      adminEmailRecipients: ['user@your-domain.com'],
    },
  }
);
```

### 2. Folder-Level Admin Access (Manual Approval)

```ts
import {
  CloudInfraMeta,
  CloudInfraEntitlement,
} from '@mutinex/cloud-infra';
import { orgFolder } from './foldersTags';
import { orgProjectAdmin } from './roles';

const orgAdminEntitlementMeta = new CloudInfraMeta({
  name: 'org-admin',
  omitDomain: true,
  omitPrefix: true,
});

export const orgAdminEntitlement = new CloudInfraEntitlement(
  orgAdminEntitlementMeta,
  {
    maxRequestDuration: '7200s',
    eligibleUsers: [
      {
        principals: ['group:group@your-domain.com'],
      },
    ],
    privilegedAccess: {
      gcpIamAccess: {
        roleBindings: [
          {
            role: orgProjectAdmin,
          },
        ],
        resource: orgFolder.getFolder().id,
        resourceType: 'folder',
      },
    },
    additionalNotificationTargets: {
      adminEmailRecipients: ['user@your-domain.com'],
    },
    approvalWorkflow: {
      manualApprovals: {
        steps: [
          {
            approvalsNeeded: 1,
            approvers: {
              principals: ['group:group@your-domain.com'],
            },
          },
        ],
      },
    },
  }
);
```

### 3. Organization-Level Emergency Access

```ts
import {
  CloudInfraMeta,
  CloudInfraEntitlement,
} from '@mutinex/cloud-infra';

const orgAdminDefaultEntitlementMeta = new CloudInfraMeta({
  name: 'big-red-button',
  omitDomain: true,
  omitPrefix: true,
});

export const orgAdminDefaultEntitlement = new CloudInfraEntitlement(
  orgAdminDefaultEntitlementMeta,
  {
    maxRequestDuration: '7200s',
    eligibleUsers: [
      {
        principals: ['group:group@your-domain.com'],
      },
    ],
    privilegedAccess: {
      gcpIamAccess: {
        roleBindings: [
          {
            role: 'roles/resourcemanager.organizationAdmin',
          },
        ],
        resource: 'organizations/YOUR_ORGANIZATION_ID',
      },
    },
    additionalNotificationTargets: {
      adminEmailRecipients: ['user@your-domain.com'],
    },
  }
);
```

### 4. Multi-Step Approval Workflow

```ts
import {
  CloudInfraMeta,
  CloudInfraEntitlement,
} from '@mutinex/cloud-infra';
import { parentFolder } from './foldersTags';
import { orgIamPolicyAdmin } from './roles';

const orgIamPolicyAdminEntitlementMeta = new CloudInfraMeta({
  name: 'org-iam-policy-admin',
  omitDomain: true,
  omitPrefix: true,
});

export const orgIamPolicyAdminEntitlement = new CloudInfraEntitlement(
  orgIamPolicyAdminEntitlementMeta,
  {
    maxRequestDuration: '3600s',
    eligibleUsers: [
      {
        principals: ['group:group@your-domain.com'],
      },
    ],
    privilegedAccess: {
      gcpIamAccess: {
        roleBindings: [
          {
            role: orgIamPolicyAdmin,
          },
        ],
        resource: parentFolder.getFolder().id,
        resourceType: 'folder',
      },
    },
    additionalNotificationTargets: {
      adminEmailRecipients: ['user@your-domain.com'],
    },
    approvalWorkflow: {
      manualApprovals: {
        steps: [
          {
            approvalsNeeded: 1,
            approvers: {
              principals: ['group:group@your-domain.com'],
            },
          },
        ],
      },
    },
  }
);
```

---

## Configuration

### Required Pulumi Configuration

This component requires GCP organization configuration in your Pulumi stack:

```bash
pulumi config set cloudInfra:organizationId "your-org-id-here"
pulumi config set cloudInfra:organizationName "your-organization-name-here"
```

### Core Properties

| Field                           | Type     | Description                                                                                                 |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `entitlementId`                 | `string` | Unique identifier for the entitlement. Defaults to [`CloudInfraMeta.getName()`](../../core/meta/README.md). |
| `location`                      | `string` | GCP location for the entitlement. Defaults to `global` when domain is `gl`.                                 |
| `maxRequestDuration`            | `string` | Maximum duration for access requests (e.g., `"3600s"` for 1 hour).                                          |
| `privilegedAccess`              | `object` | Configuration for the privileged access being granted.                                                      |
| `eligibleUsers`                 | `array`  | List of users/groups eligible to request this entitlement.                                                  |
| `approvalWorkflow`              | `object` | Optional approval workflow configuration.                                                                   |
| `additionalNotificationTargets` | `object` | Additional notification settings.                                                                           |

### Privileged Access Configuration

The `privilegedAccess` object supports GCP IAM access:

```ts
privilegedAccess: {
  gcpIamAccess: {
    roleBindings: [
      {
        role: "roles/viewer" | CloudInfraRole, // Role to grant
        condition?: object, // Optional IAM condition
      }
    ],
    resource: string, // Resource path (e.g., "/projects/my-proj")
    resourceType?: "project" | "folder" | "organization", // Resource type
  }
}
```

### Approval Workflow

Configure manual approval requirements:

```ts
approvalWorkflow: {
  manualApprovals: {
    requireApproverJustification?: boolean, // Defaults to true
    steps: [
      {
        approvalsNeeded: number, // Number of approvals required
        approvers: {
          principals: string[], // List of approver emails/groups
        },
        approverEmailRecipients?: string[], // Custom notification list
      }
    ]
  }
}
```

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraRole`](../../components/role/README.md) – Custom IAM role creation for entitlements
- [`CloudInfraServiceAccount`](../../components/account/README.md) – Service accounts for workload identity
- [`CloudInfraAccessMatrix`](../../core/access-matrix/README.md) – IAM policy management

### Organization Modules

- [`CloudInfraFolder`](../folder/README.md) – Folder-level entitlements and governance
- [`CloudInfraServiceProject`](../project/README.md) – Project-level entitlements
- [`CloudInfraHostProject`](../project/README.md) – Host project entitlements
- [`CloudInfraWIPProvider`](../wip/README.md) – Workload Identity Pool integration

---

## See Also

- [GCP Privileged Access Manager Documentation](https://cloud.google.com/privileged-access-manager/docs)
- [Organization Folder Management](../folder/README.md)
- [Project Management](../project/README.md)
- [Workload Identity Pools](../wip/README.md)
- [Custom IAM Roles](../../components/role/README.md)
