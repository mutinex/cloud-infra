# CloudInfraRepository – Artifact Registry helper

A high-level wrapper around `gcp.artifactregistry.Repository` that applies CloudInfra conventions for naming, location, and output management.

This component creates a Google Artifact Registry **repository** that follows the same naming, location and output conventions used throughout the `@mutinex/cloud-infra` library.

---

## Quick-start

```ts
import {
  CloudInfraRepository,
} from '@mutinex/cloud-infra';

// Creates a Docker repository in the default project & location inferred from the domain
const repo = new CloudInfraRepository('docker', { domain: 'au' });

export const repoName = repo.getName();
```

### Override any `RepositoryArgs`

```ts
const repo = new CloudInfraRepository('docker', {
  domain: 'au',
  format: 'DOCKER',
  description: 'Container images for my service',
  cleanupPolicies: [
    {
      id: 'keep-last-30',
      action: 'DELETE',
      condition: { newerThan: '30d' },
    },
  ],
});
```

---

## Real-World Examples

The following example is based on actual production infrastructure:

### Production Artifact Registry Setup

```ts
import * as pulumi from '@pulumi/pulumi';
import {
  CloudInfraRepository,
} from '@mutinex/cloud-infra';
import { orgProject } from './projects';

// Conditional repository creation based on stack
const growthosRepo: CloudInfraRepository | undefined =
  pulumi.getStack() === 'prd'
    ? (() => {
        return new CloudInfraRepository('growthos', {
          domain: 'au',
          location: 'australia-southeast1',
          naming: 'no-prefix',
          project: orgProject.getProjectId(),
        });
      })()
    : undefined;

export { growthosRepo };
```

### Key Production Patterns

1. **Stack-Based Conditional Creation**
   - Repository only created in production stack
   - Enables environment-specific resource provisioning

2. **Regional Location Strategy**
   - Uses specific regional location (`australia-southeast1`)
   - Optimizes for local access patterns

3. **Project Integration**
   - Repository created in service project
   - Inherits project-level permissions and billing

4. **Naming Conventions**
   - Uses domain-specific naming (`au` domain)
   - Omits prefix for cleaner repository names

---

## Location handling

Artifact Registry supports only **single regions** (e.g. `us-central1`) _or_ the **multi-regions** `us`, `europe`, or `asia`.

The component exposes the full flexibility of `CloudInfraMeta.location` while ensuring the value passed to Artifact Registry is valid:

1. If you provide an explicit **single region** (`us-central1`, `australia-southeast1`, …) it is forwarded unchanged.
2. The multi-region aliases below are automatically normalised:
   - `us` → `us`
   - `asia` → `asia`
   - `europe` → `europe`
   - `eu` → `europe` _(alias)_

No other transformations are performed; if you pass a dual-region code like `nam4` you must ensure it is accepted by Artifact Registry.

---

## Outputs

The component exposes `exportOutputs(manager)` to record the repository with a [`CloudInfraOutput`](../../core/output/README.md) for cross-stack consumption:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();
repo.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); // legacy nested wire
```

---

## API

### Constructor

`CloudInfraRepository` is **name-first** (v2 DX, preferred):

```ts
new CloudInfraRepository(
  name: string,
  args?: CloudInfraRepositoryArgs,
  opts?: pulumi.ComponentResourceOptions,
);
```

- **`name`** – Required resource name controlling naming (see [`CloudInfraMeta`](../../core/meta/README.md) naming rules).
- **`args`** – Naming options (`domain`, `location`, `prefix`, `naming` — `'conventional' | 'no-location' | 'no-prefix' | 'literal' | { preview }`) folded together with any subset of Pulumi `RepositoryArgs` (`format`, `description`, `cleanupPolicies`, …).
- **`opts`** – Optional Pulumi `ComponentResourceOptions`.

A meta-first overload (`new CloudInfraRepository(meta, config, opts?)`) is retained for backward compatibility but is **`@deprecated`**; it produces identical resources.

### Methods

| method                   | description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `getRepository()`        | Returns the underlying `gcp.artifactregistry.Repository` instance. |
| `getId()`                | Pulumi output with the resource ID.                                |
| `getName()`              | Pulumi output with the repository name.                            |
| `exportOutputs(manager)` | Records the resource with a `CloudInfraOutput`.                    |

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraBucket`](../../components/bucket/README.md) – Storage buckets with similar naming/location logic
- [`CloudInfraServiceAccount`](../../components/account/README.md) – Service accounts for repository access
- [`CloudInfraRole`](../../components/role/README.md) – Custom roles for repository permissions

### Organization Modules

- [`CloudInfraServiceProject`](../project/README.md) – Service projects that contain repositories
- [`CloudInfraWIPProvider`](../wip/README.md) – Workload Identity Pool for CI/CD access
- [`CloudInfraFolder`](../folder/README.md) – Folder organization for repository resources

---

## See Also

- [GCP Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)
- [Container Image Management](https://cloud.google.com/artifact-registry/docs/docker)
- [Project Management](../project/README.md)
- [Workload Identity Pools](../wip/README.md)
- [Storage Buckets](../../components/bucket/README.md)
