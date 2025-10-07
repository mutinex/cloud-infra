# @mutinex/cloud-infra/meta

A foundational helper for standardizing metadata across Pulumi components.

`CloudInfraMeta` is the single source of truth for naming, regionality, and other metadata used by every `@mutinex/cloud-infra` component. It accepts a declarative input and produces predictable, policy-compliant values for:

- GCP region, multi-region, or dual-region codes
- Fully-qualified and compliant resource names
- Project and prefix identifiers

The helper is published as part of **`@mutinex/cloud-infra`**.

```bash
npm install @mutinex/cloud-infra
```

---

## Key Concepts

### Value Derivation

To reduce boilerplate, `CloudInfraMeta` automatically derives key values from the Pulumi context if they are not provided explicitly:

- **`prefix`**: Defaults to the Pulumi **project name** (e.g., from `Pulumi.yaml`).

You can always override these defaults by passing `prefix` in the constructor.

### Naming Convention and Philosophy

The goal is to create predictable, informative, and compliant resource names. While the convention is enforced by `CloudInfraMeta`, choosing a good "meaningful part" (the `name` property) is key.

**Generated Name Structure**

The standard generated name follows the pattern: **`<prefix>-<name>-<location_code>`**

- **`prefix`**: The service or project identifier, derived from the Pulumi project.
- **`name`**: The meaningful part you provide to describe the resource's purpose.
- **`location_code`**: A short code for the geographic location (e.g., `au-se1`, `nam4`).

Note that the **environment (`dev`, `prd`, etc.) is handled as separate metadata** and is not part of the resource name itself. This provides environment context for policies or tagging while keeping names cleaner.

**Choosing a Good `name`**

The `name` you provide is the core of the resource identifier. Follow these rules:

- It **MUST** be unique within the Pulumi project.
- It **MUST NOT** contain generic prefixes (`org-`), resource types (`-sa`), locations (`-us`), or environments (`-dev`). `CloudInfraMeta` handles this for you.
- It **SHOULD** be as informative as possible (e.g., `auth-api-external` instead of just `api`).
- It **SHOULD** include specific characteristics if applicable, like `internal`/`external`.

**Location in Names**

Even for global GCP resources, a location code (like `-gl`) is included by default. This is intentional, as it prevents naming collisions for resources that serve the same logical purpose but in different geographic contexts (e.g., a service account for US data vs. AU data). Use `omitDomain: true` only when a resource is truly and uniquely global.

### Location Importance

While `CloudInfraMeta` can infer a default region from the `domain`, **explicitly setting the `location` is highly recommended.**

- **Clarity**: It makes your infrastructure code easier to understand by removing ambiguity about where resources will be provisioned.
- **Control**: It gives you precise control, which is essential for placing resources in specific regions for latency, cost, or compliance reasons.
- **Advanced Configurations**: It is required for multi-region and dual-region setups, as these cannot be inferred from the `domain` alone.

---

## API Reference

The primary export is the `CloudInfraMeta` class. Detailed documentation for all constructor inputs and methods is available via IntelliSense in your IDE, powered by comprehensive JSDoc.

### Quick Reference

| Method             | Returns                  | Description                                                   |
| :----------------- | :----------------------- | :------------------------------------------------------------ |
| `getName()`        | `string`                 | A single generated name (for `name: string`).                 |
| `getNames()`       | `Record<string, string>` | Map of input names to generated names.                        |
| `getLocation()`    | `string`                 | The resolved location (e.g., `australia-southeast1`, `nam4`). |
| `getRegion()`      | `string`                 | A single GCP region (throws for dual/multi-region).           |
| `getDualRegion()`  | `string[]`               | The two regions in a dual-region setup.                       |
| `getMultiRegion()` | `string[]`               | Location(s) as an array, useful for replication logic.        |
| `getPrefix()`      | `string`                 | The final prefix (explicit or derived).                       |
| `getGcpProject()`  | `pulumi.Input<string>`   | The configured GCP Project ID.                                |

---

## Usage Examples

### Real-World Example: Service Account Naming

This example shows how `CloudInfraMeta` is used in production for creating service accounts with proper naming conventions, based on actual usage from the pulumi2 project:

```typescript
import {
  CloudInfraMeta,
  CloudInfraBulkAccount,
} from '@mutinex/cloud-infra';
import { gcpProjectId } from './config';

// Create metadata for Australian service accounts
const saAuMeta = new CloudInfraMeta({
  name: ['api', 'frontend'],
  domain: 'au',
});

// Create bulk service accounts using the metadata
const saAu = new CloudInfraBulkAccount(saAuMeta, {
  project: gcpProjectId,
});

// This generates service accounts with names like:
// - "my-proj-api-au-se1"
// - "my-proj-frontend-au-se1"
```

### Real-World Example: Project Naming with Custom Options

This example demonstrates advanced naming patterns used in the org project for infrastructure components:

```typescript
import {
  CloudInfraMeta,
  CloudInfraHostProject,
} from '@mutinex/cloud-infra';
import * as pulumi from '@pulumi/pulumi';

// Base project with custom naming (omitting prefix and domain)
const baseProjectMeta = new CloudInfraMeta({
  name: `org-base-${pulumi.getStack()}`,
  omitDomain: true,
  omitPrefix: true,
});

// Service accounts for GitHub Actions (global naming)
const ghaAccountsMeta = new CloudInfraMeta({
  name: [`org-${pulumi.getStack()}-gha`],
  omitPrefix: true,
  omitDomain: true,
});

// This creates clean names like "org-base-prd" and "org-prd-gha"
// without additional prefixes or domain suffixes
```

### 1. Regional Resource

This example creates a resource in a specific region, deriving the prefix and location from the Pulumi project and stack.

```ts
import { CloudInfraMeta } from '@mutinex/cloud-infra';

// Assuming Pulumi project: "my-proj", stack: "dev"
const meta = new CloudInfraMeta({
  name: 'api',
  domain: 'au', // Infers location "australia-southeast1"
});

export const name = meta.getName(); // "my-proj-api-au-se1"
export const location = meta.getLocation(); // "australia-southeast1"
export const prefix = meta.getPrefix(); // "my-proj"
```

### 2. Global Resource (Location-less)

Use `omitDomain: true` for resources that do not have a geographic location.

```ts
import { CloudInfraMeta } from '@mutinex/cloud-infra';

const meta = new CloudInfraMeta({
  name: 'kms-key',
  domain: 'gl', // "gl" for Global
  omitDomain: true, // Strips the location suffix
});

export const keyName = meta.getName(); // "my-proj-kms-key"
```

### 3. Dual-Region Bucket

Provide a two-element array to `location` to configure a dual-region resource. `getLocation()` will return the appropriate dual-region code (e.g., `nam4`).

```ts
import { CloudInfraMeta } from '@mutinex/cloud-infra';

const meta = new CloudInfraMeta({
  name: 'backup-bucket',
  location: ['us-central1', 'us-east1'],
});

export const name = meta.getName(); // "my-proj-backup-bucket-nam4"
export const location = meta.getLocation(); // "nam4"
export const regions = meta.getDualRegion(); // ["us-central1", "us-east1"]

// getMultiRegion() provides the same array, useful for iteration.
export const multiRegions = meta.getMultiRegion(); // ["us-central1", "us-east1"]
```

### 4. Bulk Naming

Pass an array to `name` to generate multiple names at once. `getNames()` returns a convenient key-value map.

```ts
import { CloudInfraMeta } from '@mutinex/cloud-infra';

const meta = new CloudInfraMeta({
  name: ['auth-db', 'etl-server', 'ui-service'],
  domain: 'us', // Infers "us-central1"
});

export const names = meta.getNames();
/*
names = {
  "auth-db": "my-proj-auth-db-us-c1",
  "etl-server": "my-proj-etl-server-us-c1",
  "ui-service": "my-proj-ui-service-us-c1",
}
*/
```

---

## Location Resolution

The `location` property is flexible and can accept a single region, a multi-region identifier, or a dual-region array. The table below shows how the helper methods resolve various inputs.

| `domain`  | `location`                               | `getLocation()`          | `getRegion()`            | `getDualRegion()`          |
| :-------- | :--------------------------------------- | :----------------------- | :----------------------- | :------------------------- |
| _default_ | _omitted_                                | `"undefined"`            | `"undefined"`            | **Error**                  |
| `"au"`    | _omitted_                                | `"australia-southeast1"` | `"australia-southeast1"` | **Error**                  |
| `"au"`    | `["asia-northeast1", "asia-northeast2"]` | `"asia1"`                | **Error**                | `["asia-northeast1", ...]` |
| `"us"`    | _omitted_                                | `"us-central1"`          | `"us-central1"`          | **Error**                  |
| `"us"`    | `["us-central1", "us-east1"]`            | `"nam4"`                 | **Error**                | `["us-central1", ...]`     |
| `"us"`    | `"us"` _(multi-region)_                  | `"us"`                   | **Error**                | **Error**                  |
| `"gl"`    | `"europe-west1"`                         | `"europe-west1"`         | `"europe-west1"`         | **Error**                  |

**Notes:**

1.  **Domain Fallback**: When `location` is omitted, a default region is chosen based on the `domain`.
2.  **Dual-Region Mapping**: An array of two regions is automatically mapped to Google's predefined dual-region code (e.g., `nam4`, `eur4`, `asia1`).
3.  **Method Strictness**: `getRegion()` works only for single regions, and `getDualRegion()`
