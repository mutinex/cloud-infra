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
import {
  CloudInfraMeta,
  CloudInfraRepository,
} from '@mutinex/cloud-infra';

const meta = new CloudInfraMeta({
  name: 'docker',
  domain: 'us',
  location: 'europe',
});

const repo = new CloudInfraRepository(meta, {
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

## Multi-Region Support

Accepts multi-region identifiers:

- `us` - United States
- `asia` - Asia
- `europe` / `eu` - Europe (normalized to `europe`)

Or explicit single-region codes like `us-central1`, `europe-west1`, etc.
