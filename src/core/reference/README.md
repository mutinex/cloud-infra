# @mutinex/cloud-infra/core/reference

This module provides a simplified and robust interface for consuming outputs from other Pulumi stacks. It acts as a specialized wrapper around `pulumi.StackReference`, offering a more opinionated, type-safe, and developer-friendly API for accessing cross-stack resources.

The primary export is `CloudInfraReference`, a class designed to work with stacks that have structured their outputs using the `@mutinex/cloud-infra/core/output` module. It simplifies accessing outputs by organizing them by domain and providing convenient aliases and accessor methods for different resource types.

## Key Features

- **Simplified Stack Access**: Abstract away the verbosity of `pulumi.StackReference`.
- **Domain-Scoped Lookups**: Easily target resources in a specific domain (e.g., `au`, `us`, `gl`).
- **Resource Aliases**: Use short aliases (e.g., `sa`, `bucket`) instead of full Pulumi resource type strings.
- **Type-Safe Accessors**: Use methods like `getId()` and `getEmail()` to retrieve specific, strongly-typed properties from resources.
- **Automatic Caching**: Caches `StackReference` instances to optimize performance across a single deployment.

## Resource Type Aliases

To simplify referencing common resources, the `CloudInfraReference` class supports the following string aliases. These are not case-sensitive.

| Alias(es)                         | Pulumi Resource Type              |
| :-------------------------------- | :-------------------------------- |
| `serviceaccount`, `sa`, `account` | `gcp:serviceaccount:Account`      |
| `gcs`, `bucket`                   | `gcp:storage:Bucket`              |
| `role`                            | `gcp:projects:IAMCustomRole`      |
| `orgrole`                         | `gcp:organizations:IAMCustomRole` |
| `network`                         | `gcp:compute:Network`             |
| `subnet`                          | `gcp:compute:Subnetwork`          |
| `connector`                       | `gcp:vpcaccess:Connector`         |
| `project`                         | `gcp:organizations:Project`       |
| `tag`                             | `gcp:tags:TagValue`               |
| `folder`                          | `gcp:organizations:Folder`        |

## Installation

This module is part of the `@mutinex/cloud-infra` package. Ensure you have it installed in your project.

```bash
npm install @mutinex/cloud-infra
```

## Usage

### Real-World Example: Cross-Stack Resource References

This example shows how the Reference Manager is used in production to access resources from other stacks, based on actual usage from the org project:

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as pulumi from '@pulumi/pulumi';

// Reference the organization stack for global resources
const orgOrgRef = new CloudInfraReference({
  domain: 'gl',
  stack: 'organization/my-org/prd',
});

// Get folder IDs for project organization
export const orgFolder = orgOrgRef.getId('folder', 'org');
export const baseFolder = orgOrgRef.getId('folder', 'base');

// Get custom role IDs from the organization stack
export const orgProjectAdminRole = orgOrgRef.getId('orgrole', 'project-admin');
export const orgViewerRole = orgOrgRef.getId('orgrole', 'viewer');

// Get environment tag for the current stack
export const envTag = orgOrgRef.getId('tag', pulumi.getStack());
```

### Real-World Example: Multi-Domain Infrastructure References

This example demonstrates referencing resources across multiple domains and stacks, from the pulumi2 project:

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as pulumi from '@pulumi/pulumi';
import { previewParentStack } from './config';

// Reference different domains of the same stack
const orgGlRef = new CloudInfraReference({
  domain: 'gl',
  stack: `organization/org/${previewParentStack || pulumi.getStack()}`,
});

const orgAuRef = new CloudInfraReference({
  domain: 'au',
  stack: `organization/org/${previewParentStack || pulumi.getStack()}`,
});

const orgUsRef = new CloudInfraReference({
  domain: 'us',
  stack: `organization/org/${previewParentStack || pulumi.getStack()}`,
});

// Get networking resources from different regions
export const baseNetwork = orgGlRef.getId(
  'network',
  `org-base-${previewParentStack || pulumi.getStack()}`
);
export const connectorAuSe1 = orgAuRef.getId('connector', 'vcon');
export const connectorUsUs1 = orgUsRef.getId('connector', 'vcon');

// Get service account emails for different regions
export const selfApiSa = orgAuRef?.getEmail('account', 'api');
export const selfFrontendAuSa = orgAuRef?.getEmail('account', 'frontend');
export const selfFrontendUsSa = orgUsRef?.getEmail('account', 'frontend');
```

### Example 1: Referencing a Foundational Network

This example shows how to reference a VPC network and a subnet created in a foundational infrastructure stack.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';

// 1. Create a reference to the 'prd' environment of the 'base' project.
//    Scope the reference to the 'au' domain.
const baseInfra = new CloudInfraReference({
  stack: 'organization/base/prd',
  domain: 'au',
});

// 2. Retrieve the ID of the default network using the 'network' alias.
const networkId = baseInfra.getId('network', 'default');

// 3. Retrieve the full resource object for the services subnet.
const servicesSubnet = baseInfra.get('subnet', 'services');

// 4. Use the referenced outputs to create a new resource.
const firewallRule = new gcp.compute.Firewall('allow-internal', {
  network: networkId,
  allows: [
    {
      protocol: 'tcp',
      ports: ['0-65535'],
    },
  ],
  sourceRanges: [servicesSubnet.apply(s => s.ipCidrRange)],
});

export const firewallName = firewallRule.name;
```

### Example 2: Connecting a Cloud Run Service to a VPC

This example shows how to reference a Serverless VPC Access Connector from a shared infrastructure stack to allow a Cloud Run service to access resources within a VPC, such as a Cloud SQL database.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

// 1. Reference the foundational infrastructure stack for the 'us' domain.
const baseInfra = new CloudInfraReference({
  stack: 'organization/base/prd',
  domain: 'us',
});

// 2. Retrieve the ID of the VPC connector using the 'connector' alias.
const connectorId = baseInfra.getId('connector', 'default');

// 3. Define a Cloud Run service that uses the referenced connector.
const myService = new gcp.cloudrun.Service('my-app-service', {
  location: 'us-central1', // Must be in the same region as the connector
  template: {
    spec: {
      containers: [
        {
          image: 'gcr.io/cloudrun/hello',
        },
      ],
    },
    metadata: {
      annotations: {
        'run.googleapis.com/vpc-access-connector': connectorId,
        'run.googleapis.com/vpc-access-egress': 'all-traffic',
      },
    },
  },
});

export const serviceUrl = myService.statuses.apply(s => s[0]?.url);
```

### Example 3: Referencing a Global Resource

If a resource is not tied to a specific domain (e.g., a global IAM role), you can use the `gl` domain to reference it.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';

// Reference the 'security' stack, targeting the 'gl' (global) domain.
const securityStack = new CloudInfraReference({
  stack: 'organization/security/prd',
  domain: 'gl',
});

// Get the full name of a custom organization-level role.
const auditorRoleName = securityStack.getName('orgrole', 'auditor');

// Use the role to create a project-level IAM binding.
const project = new gcp.organizations.Project('my-app-project', {
  // ... project config
});
const projectBinding = new gcp.projects.IAMMember('auditor-binding', {
  project: project.projectId,
  role: auditorRoleName,
  member: 'user:auditor@example.com',
});

export const bindingId = projectBinding.id;
```

### Example 4: Using the Raw `get` Method

If you need access to a property that does not have a dedicated accessor (e.g., `selfLink`), you can use the generic `get()` method and `apply()` to access any property on the resource object.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';

const infra = new CloudInfraReference({
  stack: 'organization/base/prd',
  domain: 'au',
});

// Get the full resource object for a bucket.
const bucketRef = infra.get('bucket', 'archive');

// Access the 'selfLink' property from the object.
export const bucketSelfLink = bucketRef.apply(b => b.selfLink);

// Access the bucket's location.
export const bucketLocation = bucketRef.apply(b => b.location);
```
