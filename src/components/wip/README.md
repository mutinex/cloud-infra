# Workload Identity Pools (`@mutinex/cloud-infra/components/wip`)

Opinionated helpers for Google Cloud **Workload Identity Pools** (WIP) and
**OIDC Providers** used to let external systems (like GitHub Actions) obtain
short-lived GCP credentials without service-account keys.

| Component                             | Purpose                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`CloudInfraWIP`](./index.ts)         | Creates/owns a Workload Identity Pool and stores it in `CloudInfraOutput`.                                                   |
| [`CloudInfraWIPProvider`](./index.ts) | Creates an OIDC Provider under an existing pool (or the one above) and provides `getPrincipalSet()` helper for IAM bindings. |

---

## Quick-start

```typescript
import {
  CloudInfraMeta,
  CloudInfraWIP,
  CloudInfraWIPProvider,
} from '@mutinex/cloud-infra';
import { hostProject } from './projects'; // existing Host/Service project

const meta = new CloudInfraMeta({
  name: 'github',
  omitPrefix: true,
  omitDomain: true,
});

// 1️⃣ Create (or import) a Workload Identity Pool in the host project
const ghaPool = new CloudInfraWIP(meta, {
  project: hostProject.getProjectId(),
  displayName: 'GitHub Actions Pool',
});

// 2️⃣ Add an OIDC provider that trusts `token.actions.githubusercontent.com`
const ghaProvider = new CloudInfraWIPProvider(meta, {
  project: hostProject.getProjectId(),
  workloadIdentityPoolId: ghaPool.getId(),
  displayName: 'GitHub OIDC Provider',
});
```

---

## Configuration

### `CloudInfraWIP`

| Field                | Type                                                                                                                                 | Default | Description              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------ |
| _(all other fields)_ | Same as [`gcp.iam.WorkloadIdentityPoolArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/iam/workloadidentitypool/#inputs) | —       | Passed straight through. |

If `project` is omitted, the current Pulumi provider project is used.

### `CloudInfraWIPProvider`

| Field                    | Type                                                                                                                                                 | Required | Description                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `pool`                   | `CloudInfraWIP`                                                                                                                                      | ✗        | Direct reference to a `CloudInfraWIP` instance.            |
| `workloadIdentityPoolId` | `Input<string>`                                                                                                                                      | ✗        | Alternative to `pool` – raw Pool ID or full resource name. |
| _(others)_               | Same as [`gcp.iam.WorkloadIdentityPoolProviderArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/iam/workloadidentitypoolprovider/#inputs) | —        | Forwarded to Pulumi.                                       |

Either `pool` **or** `workloadIdentityPoolId` must be supplied.

---

## Real-World Examples

The following examples are based on actual production GitHub Actions integration:

### Production GitHub Actions Setup

```ts
import * as pulumi from '@pulumi/pulumi';
import {
  CloudInfraMeta,
  CloudInfraWIP,
  CloudInfraWIPProvider,
  CloudInfraAccessMatrix,
} from '@mutinex/cloud-infra';
import { baseProject, sharedProjectName } from './projects';
import { ghaAccounts, organizationGhaAccounts } from './accounts';

// Create Workload Identity Pool for GitHub Actions
const ghaMeta = new CloudInfraMeta({
  name: 'github',
  omitPrefix: true,
  omitDomain: true,
});

const ghaWip = new CloudInfraWIP(ghaMeta, {
  project: baseProject.getProjectId(),
  displayName: `GitHub Actions Pool`,
});

// Create OIDC Provider with comprehensive attribute mapping
export const ghaWipProvider = new CloudInfraWIPProvider(ghaMeta, {
  project: baseProject.getProjectId(),
  workloadIdentityPoolId: ghaWip.getId(),
  displayName: `GitHub Actions Provider`,
  attributeCondition: `assertion.repository_owner == "Mutiny-Group"`,
  attributeMapping: {
    'google.subject': 'assertion.sub',
    'attribute.actor': 'assertion.actor',
    'attribute.repository': 'assertion.repository',
    'attribute.repository_owner': 'assertion.repository_owner',
    'attribute.service': 'assertion.repository + "/" + assertion.environment',
  },
  oidc: {
    issuerUri: 'https://token.actions.githubusercontent.com',
  },
});

// Create principal sets for specific repositories and environments
export const growthosPrincipal = ghaWipProvider.getPrincipalSet(
  'monorepo',
  `growthos-${pulumi.getStack()}`
);

export const gcpOrganizationViewerPrincipal = ghaWipProvider.getPrincipalSet(
  'gcp-organization',
  `org-preview`
);

export const gcpOrganizationProvisionerPrincipal =
  ghaWipProvider.getPrincipalSet('gcp-organization', `org-provision`);
```

### Access Matrix Integration

```ts
// Configure IAM bindings using CloudInfraAccessMatrix
function buildGhaAccessMatrix() {
  const config = {
    '_org-owner': {
      principals: [growthosPrincipal],
      rules: [
        {
          resource: ghaAccounts.getAccount(`${sharedProjectName}-gha`),
          role: 'roles/iam.workloadIdentityUser',
        },
      ],
    },
  };

  if (organizationGhaAccounts) {
    Object.assign(config, {
      '_organization-viewer': {
        principals: [gcpOrganizationViewerPrincipal],
        rules: [
          {
            resource: organizationGhaAccounts.getAccount('viewer'),
            role: 'roles/iam.workloadIdentityUser',
          },
        ],
      },
      '_organization-provisioner': {
        principals: [gcpOrganizationProvisionerPrincipal],
        rules: [
          {
            resource: organizationGhaAccounts.getAccount('provisioner'),
            role: 'roles/iam.workloadIdentityUser',
          },
        ],
      },
    });
  }

  return config;
}

export const ghaAccessMatrix = new CloudInfraAccessMatrix(
  buildGhaAccessMatrix()
);
```

### Key Production Patterns

1. **Organization-Level Security**
   - `attributeCondition` restricts access to specific GitHub organization
   - Comprehensive attribute mapping for fine-grained access control

2. **Environment-Specific Principal Sets**
   - Different principals for different environments (dev, staging, prod)
   - Repository-specific access patterns

3. **Service Account Integration**
   - Links WIP principals to service accounts via `roles/iam.workloadIdentityUser`
   - Supports both project-level and organization-level service accounts

4. **Stack-Based Configuration**
   - Uses `pulumi.getStack()` for environment-specific naming
   - Enables multiple environments from same codebase

---

## Additional Examples

1. **Minimal pool in default project**

   ```ts
   new CloudInfraWIP(meta);
   ```

2. **Provider for GitHub Actions with attribute mapping**

   ```ts
   const provider = new CloudInfraWIPProvider(meta, {
     pool: ghaPool,
     attributeMapping: {
       'google.subject': 'assertion.sub',
       'attribute.repository': 'assertion.repository',
     },
   });
   ```

3. **Principal-set for a specific repo/environment**
   ```ts
   const principalSet = provider.getPrincipalSet('my-repo', 'prod');
   // → principalSet://iam.googleapis.com/…/attribute.service/Mutiny-Group/my-repo/prod
   ```

---

## Runtime API

| Method                        | Pool | Provider | Notes                                               |
| ----------------------------- | ---- | -------- | --------------------------------------------------- |
| `getPool()` / `getProvider()` | ✅   | ✅       | Underlying Pulumi resource.                         |
| `getId()`                     | ✅   | ✅       | Resource ID.                                        |
| `getName()`                   | ✅   | ✅       | Full resource name.                                 |
| `getPrincipalSet()`           | —    | ✅       | Build IAM `principalSet` string for GitHub Actions. |
| `exportOutputs()`             | ✅   | ✅       | Writes to `CloudInfraOutput`.                       |

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraServiceAccount`](../../components/account/README.md) – Service accounts for workload identity
- [`CloudInfraAccessMatrix`](../../core/access-matrix/README.md) – IAM policy management for WIP principals
- [`CloudInfraRole`](../../components/role/README.md) – Custom roles for WIP access

### Organization Modules

- [`CloudInfraHostProject`](../project/README.md) – Host projects that contain WIP pools
- [`CloudInfraServiceProject`](../project/README.md) – Service projects that use WIP
- [`CloudInfraEntitlement`](../pam/README.md) – PAM entitlements for WIP principals

---

## See Also

- [GCP Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Project Management](../project/README.md)
- [Service Account Management](../../components/account/README.md)
- [Access Matrix Documentation](../../core/access-matrix/README.md)
