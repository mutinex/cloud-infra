# @mutinex/cloud-infra/core/output

This module provides a robust solution for managing and structuring Pulumi resource outputs. It allows for the systematic collection and organization of resource attributes, making them easily accessible for inter-stack references, automation, or auditing purposes.

The core component is the `CloudInfraOutput`, a class that records resource details and emits them on **two wires** simultaneously:

- **Flat wire (v2, recommended)** — `getFlatOutputs()` returns a flat, single-level **keyed map** `Record<string, pulumi.Output<string>>`. Each entry is **one scalar field**, keyed `<domain>.<service>[.<region>].<name>.<field>` (separator `.`). Because every key is a top-level scalar, spreading the map onto the module's exports makes each composed key its own **top-level stack output**, readable in one hop with a plain `pulumi.StackReference.requireOutput("<key>")`.
- **Nested wire (legacy, retained for back-compat)** — `getOutputs()` returns the original `data[domain][resourceType][groupingKey]` nested map. It is still emitted unchanged.

Every call to `record()` writes to **both** wires. The flat emission is purely additive — it **never** replaces the nested map.

## Key Features

- **Flat keyed-map outputs (v2)**: one scalar `pulumi.Output<string>` per composed key, so a legacy consumer can read a single value via `requireOutput("gl.sa.mtx-dev-gha.member")` with no nested walking.
- **Dual emission**: the legacy nested map is emitted alongside the flat wire, so existing consumers keep working with no change.
- **Scalar-only**: only scalar string fields become keys (`id`, `name`, `email`, `member`, `roleId`, `location`, `uri`, `projectId`, `address`, `number`, `version`). Non-scalar fields (`urls` array, `customPlacementConfig` object) are **excluded** from the flat map and remain on the nested wire only. `Output<number>` (e.g. a project number) is coerced to `Output<string>`.
- **Collision-safe**: if two recorded resources would compose the same key, `record()` **throws** at construction time naming the colliding key.
- **Component integration**: every `@mutinex/cloud-infra` component exposes `.exportOutputs(manager)`, which calls `record()` for you with the correct type/grouping.

### Key grammar

```
<domain> . <service> [. <region>] . <name> . <field>
```

- **domain** — `meta.getDomain()` (`au` / `us` / `gl`).
- **service** — a short alias for the resource type (e.g. `gcp:serviceaccount:Account` → `sa`, `gcp:storage:Bucket` → `bucket`, `gcp:compute:Subnetwork` → `subnet`, `gcp:cloudrunv2:Service` → `run`). The full `type → alias` table is `serviceAliasMap` in `core/reference/config.ts`; the reverse `alias → type` table (`resourceTypeMap`) is what the reader's `{ type }` disambiguator accepts.
- **region** — present **only** for regional resources (the recorded entry carries a `location`). Global resources (service account, folder, project, WIP) **omit** it. A single region is shortened via `getRegionCode()` (`us-central1` → `us-c1`, `australia-southeast1` → `au-se1`); a **multi-/dual-region** location uses its canonical GCP token verbatim (`us`, `eu`, `au`, `nam4`, …) — a deterministic, collision-stable choice.
- **name** — the grouping key passed to `record()`.
- **field** — the scalar field name (`id`, `email`, `member`, …).

Example keys:

```
gl.sa.mtx-dev-gha.member            # global service account, member field
us.subnet.us-c1.services.id         # regional subnet in us-central1, id field
au.bucket.au-se1.archive.location   # regional bucket in australia-southeast1
gl.project.host.number              # global project, number (coerced to string)
```

## Installation

This module is part of the `@mutinex/cloud-infra` package. Ensure you have it installed in your project.

```bash
npm install @mutinex/cloud-infra
```

## The recommended v2 pattern

Construct an output manager, let each component record itself via `exportOutputs()`, then publish the **flat keyed map**. There are two ways to publish it:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();

// Each component records itself (calls `record()` internally).
myComponent.exportOutputs(out);

// (A) TOP-LEVEL outputs — each composed key becomes its own stack output, so a
//     legacy consumer can read one value in a single hop:
//       pulumi.StackReference.requireOutput("gl.sa.mtx-dev-gha.member")
Object.assign(exports, out.getFlatOutputs());

// (B) …or expose the whole map under ONE nested output:
export const cloudInfra = out.getFlatOutputs();

// The legacy nested wire is still emitted alongside, unchanged:
export const org = out.getOutputs();
```

> Pick **(A)** when downstream stacks read individual values with a plain
> `requireOutput("<key>")`. Pick **(B)** when a single `CloudInfraReference(..., { flat: true })`
> consumer reads the map. You can also do both (they do not conflict).

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

// v2 flat keyed map. Spread onto exports for one-hop `requireOutput("<key>")`,
// or `export const cloudInfra = orgOutput.getFlatOutputs()` for one nested
// output. The legacy nested wire is emitted alongside for back-compat.
Object.assign(exports, orgOutput.getFlatOutputs());
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

Object.assign(exports, growthosOutput.getFlatOutputs());
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

### `getFlatOutputs(): Record<string, pulumi.Output<string>>`

Returns the **v2 flat keyed map** — one entry per scalar field, keyed
`<domain>.<service>[.<region>].<name>.<field>` (see [Key grammar](#key-grammar)).
Scalar fields only: `id` (always present when defined on the resource) plus
`name`, `roleId`, `email`, `location`, `member`, `uri`, `projectId`, `address`,
`number`, `version` when defined. `Output<number>` is coerced to
`Output<string>`. The non-scalar `urls` / `customPlacementConfig` fields are
**excluded** (nested wire only). A composed-key collision **throws** at
`record()` time.

### `getOutputs(): Record<domain, Record<resourceType, Record<groupingKey, OutputResourceEntry>>>`

Returns the **legacy nested wire**. Retained for back-compat; still emitted on every `record()`. New consumers should read the flat wire.

## Output Structure

### Flat wire (`getFlatOutputs()`)

The flat wire is a single-level keyed map. A service account recorded as `record("gcp:serviceaccount:Account", "primary", metaUs, sa)` (a **global** resource, so no region segment) produces:

```json
{
  "us.sa.primary.id": "projects/your-gcp-project/serviceAccounts/...",
  "us.sa.primary.name": "your-pulumi-project-app-runner-us",
  "us.sa.primary.email": "your-pulumi-project-app-runner-us@your-gcp-project.iam.gserviceaccount.com",
  "us.sa.primary.projectId": "your-gcp-project"
}
```

A **regional** resource, e.g. `record("gcp:compute:Subnetwork", "services", metaUsCentral1, subnet)`, adds the region segment:

```json
{
  "us.subnet.us-c1.services.id": "projects/.../subnetworks/...",
  "us.subnet.us-c1.services.name": "your-pulumi-project-services-us-c1",
  "us.subnet.us-c1.services.location": "us-central1"
}
```

Spread onto the module's exports (`Object.assign(exports, out.getFlatOutputs())`), each key becomes a top-level stack output, so a consumer reads one value in a single hop: `stackRef.requireOutput("us.sa.primary.email")`.

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
