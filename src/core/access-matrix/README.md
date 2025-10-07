# Access Matrix

The Access Matrix is a powerful and flexible component for managing IAM (Identity and Access Management) policies for Google Cloud Platform (GCP) resources within a Pulumi program. It provides a declarative, case-based approach to simplify permission management, making it easier to reason about and maintain complex access control configurations.

## Core Concepts

The Access Matrix operates on a few key concepts:

- **Use Case**: A logical grouping of permissions for a specific purpose (e.g., `backend-services`, `data-pipeline-access`). Each use case is identified by a unique name.
- **Policy Rule**: A single permission grant that connects one or more principals to a role on a specific resource. This is the core building block of the Access Matrix.
- **Principal**: An identity that can be granted access to a resource. This can be a GCP service account, a user, a group, or a Workload Identity Federation principal.
- **Role**: A collection of permissions. This can be a standard GCP role (e.g., `roles/storage.objectViewer`) or a custom role.
- **Resource**: The GCP resource to which the permissions are applied (e.g., a Project, Storage Bucket, or Secret).

A key feature of the Access Matrix is its flexible principal management. Principals can be defined in three places, which are combined and deduplicated automatically:

1.  **Pulumi Configuration**: Globally for a use case in your `Pulumi.<stack>.yaml` file.
2.  **Case Level**: In your TypeScript code, applied to all policy rules within a use case.
3.  **Rule Level**: In your TypeScript code, applied only to a specific policy rule.

## Usage Patterns & Examples

### Real-World Example: Project Access Management

This example shows how the Access Matrix is used in production to manage access to GCP projects, based on actual usage from the org project:

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { orgProject, baseProject } from './projects';
import { ghaAccounts } from './accounts';
import { orgProjectAdminRole } from './refs';

// Grant GitHub Actions service account owner access to the shared project
const accessMatrix = new CloudInfraAccessMatrix({
  'shared-project-owner': {
    principals: [ghaAccounts.getAccount('org-prd-gha')],
    rules: [
      {
        resource: orgProject,
        role: 'roles/owner',
      },
    ],
  },
  'shared-project-admin': {
    rules: [
      {
        resource: orgProject,
        role: orgProjectAdminRole, // Custom role from organization stack
        label: 'my-org-project-admin',
      },
    ],
  },
  'base-project-owner': {
    rules: [
      {
        resource: baseProject,
        role: 'roles/owner',
      },
    ],
  },
});
```

### Real-World Example: Cloud Run Service Access

This example demonstrates granting public access to Cloud Run services, from the pulumi2 project:

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { apiAuService, frontendAuService } from './cloudrun';

const apiInvokerMatrix = new CloudInfraAccessMatrix({
  'api-run-invoker': {
    principals: ['allUsers'],
    rules: [
      {
        resource: apiAuService,
        role: 'roles/run.invoker',
      },
    ],
  },
});

const frontendInvokerMatrix = new CloudInfraAccessMatrix({
  'frontend-run-invoker': {
    principals: ['allUsers'],
    rules: [
      {
        resource: frontendAuService,
        role: 'roles/run.invoker',
      },
    ],
  },
});
```

### Real-World Example: Organization-Level Access

This example shows how to manage organization-wide permissions using folders and custom roles, from the my-org project:

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { parentFolder } from './foldersTags';
import { orgViewer, orgOrganizationProvisioner } from './roles';

const organizationAccessMatrix = new CloudInfraAccessMatrix({
  'org-wide-viewer': [
    {
      resource: parentFolder,
      role: orgViewer, // Custom organization role
    },
  ],
  'org-wide-owner': [
    {
      resource: parentFolder,
      role: 'roles/owner',
    },
  ],
});
```

### 1. Basic Usage with the Use Case Object

For more complex scenarios, you can use the `MatrixUseCase` object structure, which allows you to define case-level principals. These principals are automatically applied to all policy rules within the use case.

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { dataBucket, logsBucket } from './resources';
import { dataAnalyst, dataEngineer } from './principals';

const accessMatrix = new CloudInfraAccessMatrix({
  'data-analyst-access': {
    // These principals apply to all policy rules in this case
    principals: [dataAnalyst],
    rules: [
      {
        resource: dataBucket,
        role: 'roles/storage.objectViewer',
      },
      {
        resource: logsBucket,
        role: 'roles/logging.viewer',
        // You can also add rule-specific principals
        principals: [dataEngineer],
      },
    ],
  },
});
```

### 2. Using Pulumi Configuration for Principals

A powerful feature is the ability to define principals in your Pulumi stack configuration file (e.g., `Pulumi.dev.yaml`). This allows you to vary permissions across different environments (dev, staging, prod) without changing your code.

**In `Pulumi.dev.yaml`:**

```yaml
config:
  cloudInfra:accessMatrix:
    # Use case name must match the one in your code
    data-analyst-access:
      - 'group:dev-analysts@example.com'
      - 'user:lead-analyst@example.com'
```

The principals defined in the configuration will be automatically merged with any principals defined in the code for the `data-analyst-access` use case.

### 3. Handling Bulk Principals and Resources

The Access Matrix can automatically handle components that represent multiple principals or resources, as long as they expose a `getAccounts()` method.

#### Bulk Resources

If a resource object has a `getAccounts()` method, the Access Matrix will apply the specified policy rules to each sub-account returned by that method.

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { bulkServiceAccounts } from './resources'; // A bulk resource component

const accessMatrix = new CloudInfraAccessMatrix({
  'bulk-sa-access': [
    {
      // The Access Matrix will call bulkServiceAccounts.getAccounts()
      // and apply this rule to each returned service account.
      resource: bulkServiceAccounts,
      role: 'roles/iam.serviceAccountUser',
      principals: ['user:admin@example.com'],
    },
  ],
});
```

#### Bulk Principals

Similarly, if a principal object has a `getAccounts()` method, the Access Matrix will expand it into a list of principals. This is useful for granting access to a group of dynamically created service accounts.

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { dataBucket } from './resources';
import { bulkAnalysts } from './principals'; // A component with a .getAccounts() method

// 1. Granting access to ALL principals from the bulk object
const accessMatrix = new CloudInfraAccessMatrix({
  'all-analysts-access': {
    rules: [
      {
        resource: dataBucket,
        role: 'roles/storage.objectViewer',
        // The access matrix will automatically call bulkAnalysts.getAccounts()
        // and grant access to all returned principals.
        principals: [bulkAnalysts],
      },
    ],
  },
});

// 2. Granting access to a SINGLE principal from the bulk object
// To use just one principal from a bulk object, you can either retrieve it
// directly from the bulk component if it provides a helper method, or
// you can retrieve all accounts and select one.

// Method A: Using a helper method (if available on the component)
// This is the recommended approach for its clarity.
const specificAnalyst = bulkAnalysts.getAccount('analyst-1'); // Example method

const accessMatrix = new CloudInfraAccessMatrix({
  'specific-analyst-access-direct': {
    rules: [
      {
        resource: dataBucket,
        role: 'roles/storage.objectViewer',
        principals: [specificAnalyst],
      },
    ],
  },
});

// Method B: Retrieving all accounts and selecting one
// This is useful if the component only exposes a `getAccounts()` method.
const allAnalystAccounts = bulkAnalysts.getAccounts();
const specificAnalystFromAll = allAnalystAccounts['analyst-1']; // Manually select one

const accessMatrix = new CloudInfraAccessMatrix({
  'specific-analyst-access-manual': {
    rules: [
      {
        resource: dataBucket,
        role: 'roles/storage.objectViewer',
        principals: [specificAnalystFromAll], // Pass only the selected principal
      },
    ],
  },
});
```

### 4. Usage with Generic Inputs and Custom Roles

While the Access Matrix requires specific handlers for each GCP resource type, it offers full flexibility for roles and principals. You can use `pulumi.Output` types, custom role components, or dynamically created principals.

**Note**: This flexibility does not apply to the `resource` field. The resource must be of a type that has a registered handler in the Access Matrix.

```typescript
import { CloudInfraAccessMatrix } from '@mutinex/cloud-infra';
import { CloudInfraRole } from '@mutinex/cloud-infra';
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { project } from './resources';

// A supported resource (e.g., a storage bucket)
const dataBucket = new gcp.storage.Bucket('data-bucket');

// A. Using a custom role component
const auditorRole = new CloudInfraRole('auditor-role', {
  // ... role configuration
});

// B. A generic role from a stack reference
const externalRole = new pulumi.StackReference('org/roles/prod').getOutput(
  'auditorRoleName'
);

// C. A dynamically created service account to act as a principal
const dynamicSa = new gcp.serviceaccount.Account('dynamic-sa');

const accessMatrix = new CloudInfraAccessMatrix({
  'auditor-access': [
    {
      resource: project,
      role: auditorRole, // A. Pass the role object directly
      principals: ['group:auditors@example.com'],
    },
  ],
  'generic-inputs-example': [
    {
      resource: dataBucket,
      role: externalRole, // B. A generic pulumi.Output<string> is supported
      principals: [dynamicSa], // C. A generic resource acting as a principal is supported
      // The `label` is critical here for a clean Pulumi preview when the role is an Output
      label: 'bucket-auditor-from-external-role',
    },
  ],
});
```

## How IAM Resource Names Are Constructed

When the Access Matrix creates an IAM binding, it generates a unique name for the underlying Pulumi resource. This name is important for tracking resources in the Pulumi state and for understanding previews from `pulumi up`.

The name is constructed using the following pattern:

`<resource-name>:<role-name>:<principal-name>`

- **`<resource-name>`**: The name of the GCP resource you are applying the policy to (e.g., the name of your Storage Bucket). If the library cannot determine the name, it defaults to `unknown-resource`.
- **`<role-name>`**: A "safe" version of the role name. See below for how this is determined.
- **`<principal-name>`**: An identifier for the principal (e.g., `user-some-user-example-com` or a generated ID like `principal-0`).

### The Importance of `label` for Role Names

The `<role-name>` part of the resource name is generated based on these rules, in order:

1.  **Use `label` if provided**: If you add a `label` property to your policy rule, its value is used directly. This is the **highly recommended** way to ensure clear and stable names, especially when the `role` is a `pulumi.Output`.
2.  **String role**: If the `role` is a string (e.g., `"roles/storage.objectViewer"`), the library will strip the `roles/` prefix to get `storage.objectViewer`.
3.  **`CloudInfraRole` object**: If you pass a `CloudInfraRole` component, the library attempts to use the role's name.
4.  **Fallback**: If the role name cannot be resolved at preview time (for example, if the `role` is a `pulumi.Output<string>` and **no `label` is given**), the library will fall back to a generic name like `role-0`, where `0` is the index of the rule. This makes the Pulumi plan harder to read, which is why using `label` is strongly encouraged.

## Supported Resources

The Access Matrix comes with built-in support for a variety of common GCP resources:

- Projects (`gcp:organizations/project:Project`)
- Folders (`gcp:organizations/folder:Folder`)
- Service Accounts (`gcp:serviceaccount/account:Account`)
- Storage Buckets (`gcp:storage/bucket:Bucket`)
- Cloud Run Services & Jobs (`gcp:cloudrunv2/service:Service`, `gcp:cloudrunv2/job:Job`)
- Secrets (`gcp:secretmanager/secret:Secret`, `gcp:secretmanager/regionalSecret:RegionalSecret`)
- Subnetworks (`gcp:compute/subnetwork:Subnetwork`)
- Artifact Registry Repositories (`gcp:artifactregistry/repository:Repository`)
- Compute Instances (`gcp:compute/instance:Instance`)

## Configuration & Performance

### Configuration Options

The Access Matrix now supports configurable defaults via `accessMatrixConfig` in the library:

- `maxResourceNameLength`: Maximum length for generated resource names (default: 100)
- `enableDetailedLogging`: Enable detailed logging for operations (default: true)
- `maxPrincipalsThreshold`: Performance warning threshold for principals (default: 100)
- `defaultOperationTimeout`: Timeout for resource operations in ms (default: 30000)

### Performance Features

- **Caching**: Principal resolution caching improves performance for repeated operations
- **Performance Warnings**: Automatic warnings for large numbers of rules or principals
- **Processing Metrics**: Timing information for initialization and processing phases

### Utility Functions

#### Validation

```typescript
import { validateAccessMatrixCases } from '@mutinex/cloud-infra';

const result = validateAccessMatrixCases(cases);
if (!result.isValid) {
  console.error('Validation errors:', result.errors);
}
```

#### Cache Management

```typescript
import { clearAccessMatrixCaches } from '@mutinex/cloud-infra';

// Clear caches for memory management
clearAccessMatrixCaches();
```

#### System Information

```typescript
import { getAccessMatrixInfo } from '@mutinex/cloud-infra';

const info = getAccessMatrixInfo();
console.log('Supported resource types:', info.supportedResourceTypes);
console.log('Configuration:', info.configuration);
```
