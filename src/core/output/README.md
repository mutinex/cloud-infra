# @mutinex/cloud-infra/core/output

This module provides a robust solution for managing and structuring Pulumi resource outputs. It allows for the systematic collection and organization of resource attributes, making them easily accessible for inter-stack references, automation, or auditing purposes.

The core component is the `CloudInfraOutput`, a class that records resource details and emits them on **two wires** simultaneously:

- **Flat wire (v2, recommended)** — `getFlatOutputs()` returns a `FlatOutputRecord[]`: a flat array of self-describing records, each carrying its `key` / `type` / `domain` addressing **inline** alongside the resource fields.
- **Nested wire (legacy, retained for back-compat)** — `getOutputs()` returns the original `data[domain][resourceType][groupingKey]` nested map. It is still emitted unchanged.

Every call to `record()` writes to **both** wires. The flat emission is purely additive — it **never** replaces the nested map.

## Key Features

- **Flat, self-describing outputs (v2)**: each record fully describes itself (`key`, `type`, `domain` inline), so consumers filter/map over an array instead of walking three levels of nesting.
- **Dual emission**: the legacy nested map is emitted alongside the flat wire, so existing consumers keep working with no change.
- **Selective Recording**: captures only the defined fields from a resource (`id` is always present; `name` and the optional fields are included only when defined).
- **Component integration**: every `@mutinex/cloud-infra` component exposes `.exportOutputs(manager)`, which calls `record()` for you with the correct type/grouping.

## Installation

This module is part of the `@mutinex/cloud-infra` package. Ensure you have it installed in your project.

```bash
npm install @mutinex/cloud-infra
```

## The recommended v2 pattern

Construct an output manager, let each component record itself via `exportOutputs()`, then export the **flat wire** as the primary output. The nested wire is exported alongside for back-compat.

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();

// Each component records itself (calls `record()` internally).
myComponent.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); // legacy nested wire (still emitted)
```

> **Prefer components over raw resources.** Construct components with the
> name-first form (`new CloudInfraAccount("my-app", { domain: "au" })`) and call
> `exportOutputs()`. Reach for the raw `record(type, key, meta, resource)` API
> only for a resource that has no CloudInfra component wrapper.

## Usage

### Real-World Example: Exporting Infrastructure Outputs

This example shows how the Output Manager is used in production to export infrastructure components for cross-stack references, based on actual usage from the org project. Each component exposes `exportOutputs()`, which records itself with the manager.

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

// v2 flat wire (recommended), plus the legacy nested wire for back-compat.
export const cloudInfra = orgOutput.getFlatOutputs();
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

export const cloudInfra = growthosOutput.getFlatOutputs();
export const org = growthosOutput.getOutputs();
```

### Example: Recording a component

The idiomatic path is to build a component name-first and let it record itself.

```typescript
import { CloudInfraAccount, CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();

// Name-first construction: `new X("name", { domain, ...config })`.
const sa = new CloudInfraAccount('my-app', { domain: 'au' });

// The component records itself — for an Account this calls
// `out.record("gcp:serviceaccount:Account", "my-app", meta, serviceAccount)`.
sa.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs();
export const org = out.getOutputs();
```

### Recording a raw resource (no component wrapper)

If a resource has no CloudInfra component, you can record it directly. `record()` takes a resource type, a grouping key, a `CloudInfraMeta`, and a Pulumi resource.

```typescript
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta, CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();

const meta = new CloudInfraMeta({ name: 'website-assets', domain: 'au' });

const bucket = new gcp.storage.Bucket(meta.getName(), {
  location: meta.getLocation(),
});

// record(resourceType, groupingKey, meta, resource)
out.record('gcp:storage:Bucket', 'static-site', meta, bucket);

export const cloudInfra = out.getFlatOutputs();
export const org = out.getOutputs();
```

## API

### `record(resourceType, groupingKey, meta, resource): void`

Records a resource on both wires. `resourceType` categorises the resource (use the full Pulumi type token, e.g. `"gcp:serviceaccount:Account"`, so flat-wire `type` matches the reference reader's alias table), `groupingKey` groups resources of the same type (e.g. `"primary"`), `meta` supplies the domain via `meta.getDomain()`, and `resource` is the Pulumi resource.

### `getFlatOutputs(): FlatOutputRecord[]`

Returns the **v2 flat wire**: an array of self-describing records, in `record()` insertion order. Each `FlatOutputRecord` extends `OutputResourceEntry` (the resource fields) and adds the inline addressing:

| Field    | Meaning                                                            |
| :------- | :---------------------------------------------------------------- |
| `key`    | The grouping key the resource was recorded under.                 |
| `type`   | The resource type, e.g. `"gcp:serviceaccount:Account"`.           |
| `domain` | The domain (from `meta.getDomain()`), e.g. `"au"`.                |
| `id`     | Always present.                                                   |
| `name`, `email`, `member`, `projectId`, `roleId`, `location`, `uri`, `address`, `number`, `version`, `urls`, `customPlacementConfig` | Included only when defined on the source resource. |

### `getOutputs(): Record<domain, Record<resourceType, Record<groupingKey, OutputResourceEntry>>>`

Returns the **legacy nested wire**. Retained for back-compat; still emitted on every `record()`. New consumers should read the flat wire.

## Output Structure

### Flat wire (`getFlatOutputs()`)

The flat wire is an array. A service account recorded as `record("gcp:serviceaccount:Account", "primary", metaUs, sa)` produces an element like:

```json
[
  {
    "key": "primary",
    "type": "gcp:serviceaccount:Account",
    "domain": "us",
    "id": "projects/your-gcp-project/serviceAccounts/...",
    "name": "your-pulumi-project-app-runner-us",
    "email": "your-pulumi-project-app-runner-us@your-gcp-project.iam.gserviceaccount.com",
    "projectId": "your-gcp-project"
  }
]
```

### Nested wire (`getOutputs()`, legacy)

The same recording on the nested wire nests the addressing into the object path:

```json
{
  "us": {
    "gcp:serviceaccount:Account": {
      "primary": {
        "id": "projects/your-gcp-project/serviceAccounts/...",
        "name": "your-pulumi-project-app-runner-us",
        "email": "your-pulumi-project-app-runner-us@your-gcp-project.iam.gserviceaccount.com",
        "projectId": "your-gcp-project"
      }
    }
  }
}
```

Both wires can be consumed downstream by `@mutinex/cloud-infra/core/reference`. The flat wire is read with `new CloudInfraReference(stack, { flat: true })`; the nested wire is the default.
