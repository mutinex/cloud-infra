# @mutinex/cloud-infra/core/output

This module provides a robust solution for managing and structuring Pulumi resource outputs. It allows for the systematic collection and organization of resource attributes, making them easily accessible for inter-stack references, automation, or auditing purposes.

The core component is the `CloudInfraOutput`, a class designed to record resource details into a nested data structure organized by domain, resource type, and a custom grouping key.

## Key Features

- **Structured Outputs**: Organizes outputs in a predictable, hierarchical format.
- **Versioning**: Allows output schemas to evolve without breaking existing consumers.
- **Selective Recording**: Captures only the specified and available fields from a resource.
- **Easy Integration**: Works with any Pulumi resource that conforms to a simple interface.

## Installation

This module is part of the `@mutinex/cloud-infra` package. Ensure you have it installed in your project.

```bash
npm install @mutinex/cloud-infra
```

## Usage

### Real-World Example: Exporting Infrastructure Outputs

This example shows how the Output Manager is used in production to export infrastructure components for cross-stack references, based on actual usage from the org project:

```typescript
import { CloudInfraOutput } from '@mutinex/cloud-infra';
import { baseProject, orgProject } from './src/projects';
import { vconAuSe1, vconUsC1, subnetAuSe1 } from './src/networks';
import { ghaAccounts, organizationGhaAccounts } from './src/accounts';
import { growthosRepo } from './src/repo';

// Create the output manager
const orgOutput = new CloudInfraOutput();

// Export projects
baseProject.exportOutputs(orgOutput);
orgProject.exportOutputs(orgOutput);

// Export networking components
vconAuSe1.exportOutputs(orgOutput);
vconUsC1.exportOutputs(orgOutput);
subnetAuSe1.exportOutputs(orgOutput);

// Export service accounts
ghaAccounts.exportOutputs(orgOutput);
if (organizationGhaAccounts) {
  organizationGhaAccounts.exportOutputs(orgOutput);
}

// Export repository if it exists
if (growthosRepo) {
  growthosRepo.exportOutputs(orgOutput);
}

// Export the structured outputs for other stacks to consume
export const org = orgOutput.getOutputs();
```

### Real-World Example: Application Stack Outputs

This example demonstrates selective output export based on configuration, from the pulumi2 project:

```typescript
import { CloudInfraOutput } from '@mutinex/cloud-infra';
import { templateConfig } from './config';
import { saAu, saUs } from './accounts';
import { apiAuService, frontendAuService } from './cloudrun';
import { apiDbUri } from './sql';
import { certsPreviewGlobal } from './certificates';

const growthosOutput = new CloudInfraOutput();

// Conditionally export outputs based on configuration
if (templateConfig.isStatic) {
  saAu!.exportOutputs(growthosOutput);
  saUs!.exportOutputs(growthosOutput);
  apiAuService.exportOutputs(growthosOutput);
  frontendAuService.exportOutputs(growthosOutput);
  apiDbUri!.exportOutputs(growthosOutput);
}

if (templateConfig.createPreviewCertificates) {
  certsPreviewGlobal!.exportOutputs(growthosOutput);
}

export const org = growthosOutput.getOutputs();
```

### Example 1: Basic Usage with a Single Resource

This example demonstrates how to record a single GCP Storage Bucket.

```typescript
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '@mutinex/cloud-infra';
import { CloudInfraOutput } from '@mutinex/cloud-infra';

// 1. Initialize the output manager with a schema version.
const outputManager = new CloudInfraOutput();

// 2. Define metadata for your resource.
const meta = new CloudInfraMeta({
  name: 'website-assets',
  domain: 'au', // Corresponds to 'australia-southeast1'
});

// 3. Create a Pulumi resource.
const bucket = new gcp.storage.Bucket(meta.getName(), {
  location: meta.getLocation(),
  website: {
    mainPageSuffix: 'index.html',
  },
});

// 4. Record the resource output.
outputManager.record(
  'storage-bucket', // Resource type identifier
  'static-site', // Grouping key
  meta,
  bucket
);

// 5. Export the collected outputs.
export const outputs = outputManager.getOutputs();
```

### Example 2: Recording Multiple Resources of the Same Type

You can record several resources of the same type by using different grouping keys.

```typescript
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '@mutinex/cloud-infra';
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const outputManager = new CloudInfraOutput();

// Metadata for the primary service account
const primaryMeta = new CloudInfraMeta({ name: 'app-runner', domain: 'us' });
const primaryAccount = new gcp.serviceaccount.Account(primaryMeta.getName(), {
  displayName: 'Primary Application Service Account',
});

// Metadata for the read-only service account
const readOnlyMeta = new CloudInfraMeta({ name: 'app-reader', domain: 'us' });
const readOnlyAccount = new gcp.serviceaccount.Account(readOnlyMeta.getName(), {
  displayName: 'Read-Only Service Account',
});

// Record both service accounts under the same resource type
outputManager.record('service-account', 'primary', primaryMeta, primaryAccount);
outputManager.record(
  'service-account',
  'read-only',
  readOnlyMeta,
  readOnlyAccount
);

export const outputs = outputManager.getOutputs();
```

### Example 3: Recording Different Resource Types

The manager can handle various resource types, organizing them under their respective domains.

```typescript
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '@mutinex/cloud-infra';
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const outputManager = new CloudInfraOutput();

// --- Australian Resources ---
const metaAU = new CloudInfraMeta({ domain: 'au' });

const bucket = new gcp.storage.Bucket(metaAU.getName('data-lake'), {
  location: metaAU.getLocation(),
});
outputManager.record('storage-bucket', 'data-lake', metaAU, bucket);

// --- US Resources ---
const metaUS = new CloudInfraMeta({ domain: 'us' });

const projectService = new gcp.projects.Service(metaUS.getName('iam-api'), {
  service: 'iam.googleapis.com',
});
outputManager.record('project-service', 'iam', metaUS, projectService);

export const outputs = outputManager.getOutputs();
```

## Output Structure

When the Pulumi program is deployed, the exported `outputs` will have a structure similar to the following. This example corresponds to the result of "Example 2".

```json
{
  "us": {
    "service-account": {
      "primary": {
        "id": "projects/your-gcp-project/serviceAccounts/...",
        "name": "your-pulumi-project-app-runner-us",
        "email": "your-pulumi-project-app-runner-us@your-gcp-project.iam.gserviceaccount.com",
        "projectId": "your-gcp-project"
      },
      "read-only": {
        "id": "projects/your-gcp-project/serviceAccounts/...",
        "name": "your-pulumi-project-app-reader-us",
        "email": "your-pulumi-project-app-reader-us@your-gcp-project.iam.gserviceaccount.com",
        "projectId": "your-gcp-project"
      }
    }
  }
}
```

This structured output can then be easily consumed by other Pulumi stacks using `pulumi.StackReference`.
