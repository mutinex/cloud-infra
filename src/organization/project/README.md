# Project Management Helpers (`@mutinex/cloud-infra`)

Opinionated wrappers around GCP **host** and **service** projects that enforce
CloudInfra naming, tagging and network conventions while removing boilerplate API
enablement steps.

| Component                                  | Purpose                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [`CloudInfraHostProject`](./host.ts)       | Creates a _host_ project, sets up a single Shared&nbsp;VPC named after the project and enables baseline / custom APIs. |
| [`CloudInfraServiceProject`](./service.ts) | Creates a _service_ project, enables APIs, attaches it to a host's Shared&nbsp;VPC and applies optional tags.          |

Both components integrate with [`CloudInfraOutput`](../../core/output/README.md) &
[`CloudInfraReference`](../../core/reference/README.md) for cross-stack sharing.

---

## Quick-start

```typescript
import {
  CloudInfraMeta,
  CloudInfraHostProject,
  CloudInfraServiceProject,
} from '@mutinex/cloud-infra';

// 1️⃣  Host Project – provides the Shared VPC
const hostMeta = new CloudInfraMeta({ name: 'corp-host', omitDomain: true });
const host = new CloudInfraHostProject(hostMeta, {
  folderId: '123456789012', // Place inside an existing folder
  cloudInfraTags: ['tagValues/5678901234567'],
  services: ['iam.googleapis.com', 'vpcaccess.googleapis.com'],
});

// 2️⃣  Service Project – attaches to the host
const svcMeta = new CloudInfraMeta({ name: 'analytics-dev', omitDomain: true });
const svc = new CloudInfraServiceProject(svcMeta, {
  folderId: '123456789012',
  vpcHostProject: host.getProjectId(), // Attach to Shared VPC
  services: ['run.googleapis.com', 'secretmanager.googleapis.com'],
});
```

---

## Configuration

### Required Pulumi Configuration

These components require GCP organization configuration in your Pulumi stack:

```bash
pulumi config set cloudInfra:organizationId "your-org-id-here"
pulumi config set cloudInfra:billingAccountId "your-billing-account-id-here"
pulumi config set cloudInfra:organizationName "your-organization-name-here"
```

### Common extras

The following properties are accepted by _both_ host and service projects in
addition to the underlying `gcp.organizations.ProjectArgs`:

| Field            | Type                    | Default | Description                                                          |
| ---------------- | ----------------------- | ------- | -------------------------------------------------------------------- |
| `cloudInfraTags` | `Input<string>[]`       | —       | Array of tag _value_ resource IDs applied to the project.            |
| `services`       | `string[]`              | `[]`    | Additional Google APIs to enable (baseline APIs are always enabled). |
| `billingAccount` | `string`                | Derived | Billing account to link (defaults to org-wide constant).             |
| `deletionPolicy` | `"DELETE" \| "PREVENT"` | —       | Controls Pulumi `protect` flag.                                      |

### `CloudInfraHostProject` specifics

| Field  | Type | Notes                                                                                  |
| ------ | ---- | -------------------------------------------------------------------------------------- |
| _none_ | —    | Network name is auto-derived from project name.<br/>Shared VPC mode is always enabled. |

### `CloudInfraServiceProject` specifics

| Field            | Type            | Required | Description                                    |
| ---------------- | --------------- | -------- | ---------------------------------------------- |
| `vpcHostProject` | `Input<string>` | ✔︎      | Project _ID_ of the host project to attach to. |

If `vpcaccess.googleapis.com` is in `services`, the component grants the
required `roles/vpcaccess.user` IAM role on the **host** project to the
Serverless Robot service account of the _service_ project.

---

## Real-World Examples

The following examples are based on actual production infrastructure patterns:

### Production Host and Service Project Setup

```ts
import * as pulumi from '@pulumi/pulumi';
import {
  CloudInfraMeta,
  CloudInfraHostProject,
  CloudInfraServiceProject,
} from '@mutinex/cloud-infra';
import { baseFolder, orgFolder, envTag } from './refs';

// Base Project (Host Project for Shared VPC)
export const sharedProjectName = `org-${pulumi.getStack()}`;

export const baseProjectMeta = new CloudInfraMeta({
  name: `org-base-${pulumi.getStack()}`,
  omitDomain: true,
  omitPrefix: true,
});

export const baseProject = new CloudInfraHostProject(baseProjectMeta, {
  folderId: baseFolder,
  deletionPolicy: 'DELETE',
  cloudInfraTags: [envTag],
  services: [
    'vpcaccess.googleapis.com',
    'iam.googleapis.com',
    'servicenetworking.googleapis.com',
    'artifactregistry.googleapis.com',
    'privilegedaccessmanager.googleapis.com',
  ],
});

// Service Project for Application Workloads
export const orgProjectMeta = new CloudInfraMeta({
  name: sharedProjectName,
  omitDomain: true,
  omitPrefix: true,
});

export const orgProject = new CloudInfraServiceProject(orgProjectMeta, {
  folderId: orgFolder,
  deletionPolicy: 'DELETE',
  vpcHostProject: baseProject.getProjectId(),
  cloudInfraTags: [envTag],
  services: [
    'vpcaccess.googleapis.com',
    'run.googleapis.com',
    'secretmanager.googleapis.com',
    'servicenetworking.googleapis.com',
    'artifactregistry.googleapis.com',
    'privilegedaccessmanager.googleapis.com',
    'sqladmin.googleapis.com',
    'pubsub.googleapis.com',
    'certificatemanager.googleapis.com',
  ],
});
```

### Key Production Patterns

1. **Host Project for Shared VPC Infrastructure**
   - Contains the shared VPC network
   - Enables networking and infrastructure APIs
   - Uses folder-based organization
   - Applies environment tags for governance

2. **Service Project for Application Workloads**
   - Attaches to the host project's shared VPC
   - Enables application-specific APIs (Cloud Run, Secret Manager, etc.)
   - Inherits network connectivity from host project
   - Organized in separate folder for workload isolation

3. **Stack-Based Naming**
   - Uses `pulumi.getStack()` for environment-specific naming
   - Enables multiple environments (dev, staging, prod) from same code

4. **Comprehensive API Enablement**
   - Host: Infrastructure APIs (VPC, IAM, Service Networking, PAM)
   - Service: Application APIs (Cloud Run, Secrets, SQL, Pub/Sub)

---

## Additional Examples

1. **Minimal Host Project inside Organisation root**

   ```ts
   new CloudInfraHostProject(meta);
   ```

2. **Host Project with custom folder & prevent-destroy**

   ```ts
   new CloudInfraHostProject(meta, {
     folderId: 'folders/789012345678',
     deletionPolicy: 'PREVENT',
   });
   ```

3. **Service Project enabling Cloud Run**

   ```ts
   new CloudInfraServiceProject(meta, {
     vpcHostProject: host.getProjectId(),
     services: ['run.googleapis.com'],
   });
   ```

4. **Service Project with tags and additional APIs**
   ```ts
   new CloudInfraServiceProject(meta, {
     vpcHostProject: host.getProjectId(),
     cloudInfraTags: ['tagValues/8901234567890'],
     services: ['run.googleapis.com', 'vpcaccess.googleapis.com'],
   });
   ```

---

## Runtime API

| Method                   | Host | Service | Notes                                      |
| ------------------------ | ---- | ------- | ------------------------------------------ |
| `getProject()`           | ✅   | ✅      | Returns `gcp.organizations.Project`.       |
| `getProjectId()`         | ✅   | ✅      | `Output<string>` of the project ID.        |
| `getProjectNumber()`     | ✅   | ✅      | `Output<string>` of the project number.    |
| `getSharedVpcNetwork()`  | ✅   | —       | Returns `gcp.compute.Network` (host only). |
| `getSharedVpcSelfLink()` | ✅   | —       | Network self-link.                         |
| `getEnabledServices()`   | ✅   | ✅      | Array of `gcp.projects.Service` resources. |
| `exportOutputs()`        | ✅   | ✅      | Writes to `CloudInfraOutput`.              |

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraServiceAccount`](../../components/account/README.md) – Service accounts for project workloads
- [`CloudInfraRole`](../../components/role/README.md) – Custom IAM roles for project access
- [`CloudInfraCloudRunService`](../../components/cloudrunservice/README.md) – Services deployed in projects
- [`CloudInfraCloudRunJob`](../../components/cloudrunjob/README.md) – Jobs deployed in projects
- [`CloudInfraDatabaseInstance`](../../components/database/README.md) – Databases deployed in projects
- [`CloudInfraBucket`](../../components/bucket/README.md) – Storage buckets in projects
- [`CloudInfraSecretVersion`](../../components/secret/README.md) – Secrets managed in projects
- [`CloudInfraRepository`](../repository/README.md) – Artifact Registry repositories in projects

### Organization Modules

- [`CloudInfraFolder`](../folder/README.md) – Folders that contain projects
- [`CloudInfraTag`](../tag/README.md) – Tags applied to projects
- [`CloudInfraSubnet`](../network/README.md) – Network subnets in host projects
- [`CloudInfraConnector`](../network/README.md) – VPC connectors for serverless access
- [`CloudInfraPSA`](../network/README.md) – Private Service Access for databases
- [`CloudInfraNat`](../network/README.md) – NAT gateways for outbound access

---

## See Also

- [GCP Project Documentation](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Shared VPC Documentation](https://cloud.google.com/vpc/docs/shared-vpc)
- [Network Management](../network/README.md)
- [Folder Management](../folder/README.md)
- [Tag Management](../tag/README.md)
- [Pulumi GCP Project Docs](https://www.pulumi.com/registry/packages/gcp/api-docs/organizations/project/)
