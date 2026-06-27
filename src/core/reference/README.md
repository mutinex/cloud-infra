# @mutinex/cloud-infra/core/reference

This module provides a simplified and robust interface for consuming outputs from other Pulumi stacks. It acts as a specialized wrapper around `pulumi.StackReference`, offering a more opinionated, type-safe, and developer-friendly API for accessing cross-stack resources.

The primary export is `CloudInfraReference`, a class designed to work with stacks that have structured their outputs using the `@mutinex/cloud-infra/core/output` module. It resolves a resource by name and returns a record of lazy `pulumi.Output<string>` fields.

## Key Features

- **The `get()` API (v2)**: `ref.get("name").field` — resolve a resource by name and read `id` / `name` / `email` / `member` / `projectId` / `version`, plus a deterministic `identifier` and a `raw` escape hatch.
- **Cross-type scan**: when you don't pass a `type`, `get()` scans every resource type under the resolved domain and returns the single match (throwing a helpful, copy-pasteable error if a name is ambiguous).
- **Flat-wire reader**: with `{ flat: true }`, reads the v2 `getFlatOutputs()` keyed map (re-assembling a record by grouping keys that share a `<domain>.<service>[.<region>].<name>` prefix); without it, reads the legacy nested wire.
- **Domain-optional mode**: omit `domain` to read flat `root[name]` string outputs (e.g. a service-account email/member).
- **Resource Aliases**: use short aliases (e.g. `sa`, `bucket`) instead of full Pulumi type strings.
- **Automatic Caching**: caches `StackReference` instances across a single deployment.

## The `get()` API (recommended)

`get()` resolves a resource by its grouping key (`name`) and returns a `ReferenceRecord` whose fields are **lazy** `pulumi.Output<string>` values — the stack output is only fetched when a field is consumed.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

// Name-first (positional) construction; `domain` optional.
const foundation = new CloudInfraReference('mutiny-group/foundation/prd', {
  domain: 'au',
});

const sa = foundation.get('my-app'); // resolve once
export const saEmail = sa.email; // lazy pulumi.Output<string>
export const saMember = sa.member;
export const saId = sa.id;
export const saName = sa.name;
export const saIdentifier = sa.identifier; // deterministic string (Frozen Contract F4)

// `raw` is an escape hatch for fields without a dedicated accessor.
export const saRaw = sa.raw; // pulumi.Output<ResourceOutput>
```

`get(name)` accepts an optional second argument `{ type?, domain? }`:

- **`type`** — disambiguate a `name` that exists under more than one resource type. Accepts a short alias (`"bucket"`) or a full Pulumi type. When omitted, `get()` performs a **cross-type scan** across every type under the resolved domain; a name shared by multiple types throws an error that lists the candidate types and shows the exact `get('name', { type: '...' })` call to disambiguate.
- **`domain`** — override the reference's configured domain for this single lookup.

```typescript
// Disambiguate a name that exists under multiple types:
const bucketId = foundation.get('archive', { type: 'bucket' }).id;

// Override the configured domain for one lookup:
const usSaEmail = foundation.get('my-app', { domain: 'us' }).email;
```

> The `get()` record reads whichever wire the reference is configured for: the
> legacy nested wire by default, or the v2 flat wire when constructed with
> `{ flat: true }`. Both are emitted by `CloudInfraOutput` in the source stack.

### Reading the v2 flat wire

If the source stack exports `CloudInfraOutput.getFlatOutputs()` under a single nested output, construct the reference with `{ flat: true }`. The reader reads the keyed map and **re-assembles a record** by grouping every key that shares a `<domain>.<service>[.<region>].<name>` prefix, then matches by `name` with the same optional `{ type, domain }` disambiguators (cross-record scan mirrors the nested cross-type scan). The `type` disambiguator (a short alias like `bucket` or a full Pulumi type) is resolved to the key's `service` segment. An empty/omitted domain means "match any domain".

```typescript
const ref = new CloudInfraReference('mutiny-group/foundation/prd', {
  domain: 'au',
  flat: true, // read the getFlatOutputs() keyed map
});

export const saEmail = ref.get('my-app').email;
```

> **Reading a single top-level key directly.** If the producer instead spread
> the map onto its exports (`Object.assign(exports, out.getFlatOutputs())`),
> every composed key is its own top-level stack output. A legacy consumer can
> then read one value in a single hop with a plain `pulumi.StackReference`,
> bypassing `CloudInfraReference` entirely:
>
> ```typescript
> import * as pulumi from '@pulumi/pulumi';
> const stack = new pulumi.StackReference('mutiny-group/foundation/prd');
> export const saMember = stack.requireOutput('gl.sa.mtx-dev-gha.member');
> ```

### Listing every record

`all()` returns a `pulumi.Output` of every record in the referenced stack as `{ domain?, type?, name, record }` entries (works across nested, flat, and domain-optional modes):

```typescript
export const everything = ref.all();
```

## Deprecated getters

The single-property getters predate `get()` and are now **`@deprecated`**. They still work, but new code should use `get(name, { type }).field`.

| Deprecated getter                  | Replacement                          |
| :--------------------------------- | :----------------------------------- |
| `getId(type, name)`                | `get(name, { type }).id`             |
| `getName(type, name)`              | `get(name, { type }).name`           |
| `getEmail(type, name)`             | `get(name, { type }).email`          |
| `getMember(type, name)`            | `get(name, { type }).member`         |
| `getProjectId(type, name)`         | `get(name, { type }).projectId`      |
| `getVersion(type, name)`           | `get(name, { type }).version`        |
| `get(type, name)` (two-string form) | `get(name, { type }).raw`           |

> **Note:** the legacy two-string form `get(resourceType, name)` returns the raw
> `pulumi.Output<ResourceOutput>` and is also `@deprecated`. The current,
> non-deprecated `get(name, options?)` form returns a `ReferenceRecord`.

`getIdentifier(name)` is **not** deprecated; it returns the same deterministic string as the record's `.identifier` field.

## Resource Type Aliases

To simplify referencing common resources, `CloudInfraReference` accepts the following string aliases for the `type` disambiguator. These are not case-sensitive.

| Alias(es)                         | Pulumi Resource Type                      |
| :-------------------------------- | :---------------------------------------- |
| `serviceaccount`, `sa`, `account` | `gcp:serviceaccount:Account`              |
| `gcs`, `bucket`                   | `gcp:storage:Bucket`                      |
| `role`                            | `gcp:projects:IAMCustomRole`              |
| `orgrole`                         | `gcp:organizations:IAMCustomRole`         |
| `network`                         | `gcp:compute:Network`                     |
| `subnet`                          | `gcp:compute:Subnetwork`                  |
| `connector`                       | `gcp:vpcaccess:Connector`                 |
| `project`                         | `gcp:organizations:Project`               |
| `tag`                             | `gcp:tags:TagValue`                       |
| `folder`                          | `gcp:organizations:Folder`                |
| `entitlement`, `pam`              | `gcp:privilegedaccessmanager:Entitlement` |
| `secret`                          | `gcp:secretmanager:Secret`                |
| `secretversion`                   | `gcp:secretmanager:SecretVersion`         |
| `certmap`                         | `gcp:certificatemanager:CertificateMap`   |
| `cloudrun`                        | `gcp:cloudrunv2:Service`                  |

## Installation

This module is part of the `@mutinex/cloud-infra` package. Ensure you have it installed in your project.

```bash
npm install @mutinex/cloud-infra
```

## Usage

### Example 1: Referencing a Foundational Network

This example shows how to reference a VPC network and a subnet created in a foundational infrastructure stack.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';

// 1. Create a reference to the 'prd' environment of the 'base' project,
//    scoped to the 'au' domain.
const baseInfra = new CloudInfraReference('organization/base/prd', {
  domain: 'au',
});

// 2. Retrieve the ID of the default network using the 'network' alias.
const networkId = baseInfra.get('default', { type: 'network' }).id;

// 3. Read fields from the services subnet (use `raw` for fields without a
//    dedicated accessor).
const servicesSubnet = baseInfra.get('services', { type: 'subnet' });

// 4. Use the referenced outputs to create a new resource.
const firewallRule = new gcp.compute.Firewall('allow-internal', {
  network: networkId,
  allows: [
    {
      protocol: 'tcp',
      ports: ['0-65535'],
    },
  ],
  sourceRanges: [servicesSubnet.raw.apply(s => (s as { ipCidrRange?: string }).ipCidrRange ?? '')],
});

export const firewallName = firewallRule.name;
```

### Example 2: Connecting a Cloud Run Service to a VPC

Reference a Serverless VPC Access Connector from a shared infrastructure stack so a Cloud Run service can reach resources inside a VPC.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';
import * as gcp from '@pulumi/gcp';

// Reference the foundational infrastructure stack for the 'us' domain.
const baseInfra = new CloudInfraReference('organization/base/prd', {
  domain: 'us',
});

// Retrieve the ID of the VPC connector using the 'connector' alias.
const connectorId = baseInfra.get('default', { type: 'connector' }).id;

const myService = new gcp.cloudrun.Service('my-app-service', {
  location: 'us-central1', // Must be in the same region as the connector
  template: {
    spec: {
      containers: [{ image: 'gcr.io/cloudrun/hello' }],
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

For a resource that is not tied to a specific region (e.g. a global IAM role), use the `gl` domain.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

// Reference the 'security' stack, targeting the 'gl' (global) domain.
const securityStack = new CloudInfraReference('organization/security/prd', {
  domain: 'gl',
});

// Get the full name of a custom organization-level role.
export const auditorRoleName = securityStack.get('auditor', { type: 'orgrole' }).name;
```

### Example 4: Cross-type scan (no `type`)

When a name is unique across types under the domain, omit `type` entirely — `get()` scans and returns the single match. If the name exists under more than one type, the thrown error tells you exactly which `{ type }` to add.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

const infra = new CloudInfraReference('organization/base/prd', {
  domain: 'au',
});

// No `type`: resolved by cross-type scan across all types under 'au'.
export const archiveId = infra.get('archive').id;

// If 'archive' existed under multiple types, the error would suggest e.g.:
//   get('archive', { type: 'gcp:storage:Bucket' })
```

### Example 5: Domain-optional reference

Omit `domain` to read flat `root[name]` string outputs directly (e.g. a service-account email exported as a bare string). In this mode there is no `type` dimension, and passing a per-lookup `domain` throws.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

const flat = new CloudInfraReference('organization/base/prd');

// Reads root['ci-runner'] as a string; email/member are sniffed from its format.
export const ciEmail = flat.get('ci-runner').email;
export const ciMember = flat.get('ci-runner').member;
```
