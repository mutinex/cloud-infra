# CloudInfraFolder

A high-level wrapper around `gcp.organizations.Folder` that applies CloudInfra conventions for naming, tagging, and output management.

## Features

- **Name / ID generation** – `displayName` defaults to [`CloudInfraMeta.getName()`](../../core/meta/README.md).
- **Parent defaulting** – `parent` defaults to the organization root when not specified.
- **Deletion protection** – `deletionProtection` defaults to `true` for safety.
- **Tag binding support** – Automatically creates tag bindings for `cloudInfraTags`.
- **Name length validation** – Ensures folder display names don't exceed GCP's 30-character limit.
- **Output registration** – Automatically recorded via [`CloudInfraOutput`](../../core/output/README.md) for cross-stack consumption.

---

## Quick Example

```ts
import { CloudInfraMeta, CloudInfraFolder } from '@mutinex/cloud-infra';

const folderMeta = new CloudInfraMeta({
  name: 'production',
  omitDomain: true,
});

const folder = new CloudInfraFolder(folderMeta, {
  cloudInfraTags: ['tagValues/1234567890'],
  deletionProtection: true,
});
```

---

## Real-World Examples

The following examples are based on actual production organization structure:

### Hierarchical Folder Organization

```ts
import {
  CloudInfraMeta,
  CloudInfraFolder,
  CloudInfraTag,
} from '@mutinex/cloud-infra';

// Environment Tag for governance
const environmentTagsMeta = new CloudInfraMeta({
  name: 'env',
  omitPrefix: true,
  omitDomain: true,
});

export const environmentTags = new CloudInfraTag(environmentTagsMeta, {
  description: 'The Environment',
  values: [
    {
      shortName: 'dev',
      description: 'Development Environment',
    },
    {
      shortName: 'prd',
      description: 'Production Environment',
    },
    {
      shortName: 'stg',
      description: 'Staging Environment',
    },
    {
      shortName: 'uat',
      description: 'User Acceptance Testing Environment',
    },
  ],
});

// Parent Folder (top-level organization)
const parentFolderMeta = new CloudInfraMeta({
  name: 'my-org',
  omitPrefix: true,
  omitDomain: true,
});

export const parentFolder = new CloudInfraFolder(parentFolderMeta, {
  deletionProtection: false,
});

// Base Infrastructure Folder
const baseFolderMeta = new CloudInfraMeta({
  name: 'base',
  omitPrefix: true,
  omitDomain: true,
});

export const baseFolder = new CloudInfraFolder(baseFolderMeta, {
  parent: parentFolder.getFolder().id,
  deletionProtection: false,
});

// Application Workloads Folder
const orgFolderMeta = new CloudInfraMeta({
  name: 'org',
  omitPrefix: true,
  omitDomain: true,
});

export const orgFolder = new CloudInfraFolder(orgFolderMeta, {
  parent: parentFolder.getFolder().id,
  deletionProtection: false,
});
```

### Key Production Patterns

1. **Hierarchical Organization**
   - Parent folder for top-level organization
   - Child folders for different purposes (base infrastructure, applications)
   - Clear separation of concerns

2. **Tag Integration**
   - Environment tags for governance and billing
   - Automatic tag binding to folders
   - Consistent tagging across resources

3. **Deletion Protection Strategy**
   - Production folders typically have `deletionProtection: true`
   - Development/testing folders may disable protection for easier cleanup

4. **Naming Conventions**
   - Uses `omitPrefix` and `omitDomain` for cleaner folder names
   - Follows organizational naming standards

---

## Configuration

### Required Pulumi Configuration

This component requires GCP organization configuration in your Pulumi stack:

```bash
pulumi config set cloudInfra:organizationId "your-org-id-here"
pulumi config set cloudInfra:organizationName "your-organization-name-here"
```

### Core Properties

| Field                | Type       | Default                                                 | Description                        |
| -------------------- | ---------- | ------------------------------------------------------- | ---------------------------------- |
| `parent`             | `string`   | Organization root                                       | Parent folder or organization ID   |
| `displayName`        | `string`   | [`CloudInfraMeta.getName()`](../../core/meta/README.md) | Folder display name (max 30 chars) |
| `deletionProtection` | `boolean`  | `true`                                                  | Prevents accidental deletion       |
| `cloudInfraTags`     | `string[]` | —                                                       | Array of tag value resource IDs    |

### Tag Binding

When `cloudInfraTags` is provided, the component automatically creates `gcp.tags.TagBinding` resources:

```ts
const folder = new CloudInfraFolder(meta, {
  cloudInfraTags: [
    'tagValues/1234567890', // Environment tag
    'tagValues/0987654321', // Cost center tag
  ],
});
```

---

## Runtime API

| Method                   | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `getFolder()`            | Returns the underlying `gcp.organizations.Folder` resource |
| `getTagBindings()`       | Returns array of `gcp.tags.TagBinding` resources           |
| `exportOutputs(manager)` | Records the folder with a `CloudInfraOutput` manager       |

### Cross-Stack Integration

```ts
// Export folder outputs for other stacks
const outputManager = new CloudInfraOutput();
folder.exportOutputs(outputManager);

// Use folder as parent in other resources
const childFolder = new CloudInfraFolder(childMeta, {
  parent: folder.getFolder().id,
});

// Use folder for project placement
const project = new CloudInfraServiceProject(projectMeta, {
  folderId: folder.getFolder().id,
});
```

---

## Validation and Constraints

### Name Length Validation

GCP folder display names must be 30 characters or less. The component validates this:

```ts
// This will throw an error if the generated name exceeds 30 characters
const folder = new CloudInfraFolder(meta); // Validates meta.getName().length <= 30
```

### Single Name Requirement

The component expects a single string name, not an array:

```ts
// ✅ Correct
const meta = new CloudInfraMeta({ name: 'production' });

// ❌ Will throw error
const meta = new CloudInfraMeta({ name: ['prod', 'staging'] });
```

---

## Related Components

- [`CloudInfraTag`](../tag/README.md) – Tag key and value management
- [`CloudInfraServiceProject`](../project/README.md) – Projects that can be placed in folders
- [`CloudInfraHostProject`](../project/README.md) – Host projects for shared VPC
- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing

---

## See Also

- [GCP Folder Documentation](https://cloud.google.com/resource-manager/docs/creating-managing-folders)
- [GCP Resource Hierarchy](https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy)
- [GCP Tags Documentation](https://cloud.google.com/resource-manager/docs/tags/tags-overview)
