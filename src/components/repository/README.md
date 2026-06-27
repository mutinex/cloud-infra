# Repository (`@mutinex/cloud-infra/components/repository`)

Opinionated helper for creating **Google Artifact Registry repositories** with automatic naming and location normalization.

## Features

- Automatic repository ID derivation from `CloudInfraMeta`
- Location normalization (e.g., `eu` → `europe`)
- Project inheritance from meta
- Default format: `DOCKER`
- CloudInfraOutput integration

## Quick Start

```typescript
import { CloudInfraRepository } from '@mutinex/cloud-infra';

const repo = new CloudInfraRepository('docker', {
  domain: 'us',
  location: 'europe',
  format: 'DOCKER',
  description: 'Docker images for US services',
});

export const repoId = repo.getId();
```

## Configuration

`CloudInfraRepositoryConfig` extends `gcp.artifactregistry.RepositoryArgs` with these defaults:

- `location`: Inherited from meta, normalized (`eu` → `europe`)
- `project`: Inherited from meta
- `repositoryId`: Derived from `meta.getName()`
- `format`: Defaults to `DOCKER`
- `description`: Defaults to repository name

## Methods

- `getRepository()`: Returns the underlying Pulumi resource
- `getId()`: Returns `pulumi.Output<string>` of the repository ID
- `getName()`: Returns `pulumi.Output<string>` of the repository name
- `exportOutputs(manager)`: Records the repository in CloudInfraOutput

## Outputs

The component participates in the v2 output wire via `exportOutputs`:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();
repo.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); //             legacy nested wire
```

`exportOutputs` records the repository under
`gcp:artifactregistry:Repository`. See [`core/output`](../../core/output) and
[`core/reference`](../../core/reference) for the full wire format and for
consuming these outputs cross-stack via `ref.get(...)`.

> **Meta-first (deprecated):** `new CloudInfraRepository(meta, config)` is
> retained for backward compatibility and produces **identical** resources; the
> name-first form shown in Quick Start is preferred. Meta-first also exposes a
> config-level `location` override (a resource location different from the
> naming location).

## Multi-Region Support

Accepts multi-region identifiers:

- `us` - United States
- `asia` - Asia
- `europe` / `eu` - Europe (normalized to `europe`)

Or explicit single-region codes like `us-central1`, `europe-west1`, etc.
