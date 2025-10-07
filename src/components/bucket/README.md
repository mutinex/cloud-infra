# Cloud Storage Bucket (`CloudInfraBucket`, `CloudInfraBulkBucket`)

> Part of **`@mutinex/cloud-infra`** – zero-boilerplate Pulumi helpers that
> apply CloudInfra naming conventions and best-practice defaults.
>
> Wraps `gcp.storage.Bucket` to automatically derive **location** (region,
> multi-region, or dual-region with custom placement) from
> [`CloudInfraMeta`](../../core/meta) and to enable versioning, UBLA, and public-
> access prevention by default.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraBucket,
  CloudInfraBulkBucket,
} from '@mutinex/cloud-infra';
```

- Constructors – `new CloudInfraBucket(meta, config?)`, `new CloudInfraBulkBucket(meta, config?)`
- Helpful getters – `.getName()`, `.getUrl()`
- Stack outputs – `.exportOutputs(outputManager)`

---

## Usage examples

### 1. Single regional bucket

```ts
const meta = new CloudInfraMeta({ name: 'assets', domain: 'au' });
const bucket = new CloudInfraBucket(meta);
```

### 2. Dual-region bucket with overrides

```ts
const meta = new CloudInfraMeta({
  name: 'logs',
  domain: 'us',
  location: ['us-central1', 'us-east1'], // pre-defined dual region (nam4)
});

const bucket = new CloudInfraBucket(meta, {
  forceDestroy: true,
  storageClass: 'NEARLINE',
});
```

### 3. Bulk buckets with per-bucket overrides

```ts
const meta = new CloudInfraMeta({
  name: ['bulk1', 'bulk2'],
  domain: 'us',
  location: ['us-central1', 'us-east1'],
});

const buckets = new CloudInfraBulkBucket(meta, {
  forceDestroy: true, // applies to all buckets
  custom: {
    bulk1: { storageClass: 'NEARLINE' },
    bulk2: { versioning: { enabled: false } },
  },
});
```

---

## Configuration

The constructor accepts anything from `gcp.storage.BucketArgs` **except**
`location` (determined automatically). In addition, the bulk component supports
an optional `custom` map for per-bucket overrides.

### Derived location mechanics

- **Single region / multi-region** – taken directly from `CloudInfraMeta.getLocation()`.
- **Predefined dual-region** (`nam4`, `eur4`, etc.) – detected automatically when
  `location` is a recognised pair.
- **Custom placement dual-region** (e.g., `"australia-southeast1", "australia-southeast2"`) –
  creates a dual-region bucket with `customPlacementConfig.dataLocations`.

### Defaults applied when not provided

| Field                      | Default      |
| -------------------------- | ------------ |
| `versioning.enabled`       | `true`       |
| `storageClass`             | `STANDARD`   |
| `uniformBucketLevelAccess` | `true`       |
| `publicAccessPrevention`   | `"enforced"` |
| `forceDestroy`             | `false`      |

All defaults can be overridden via `config`.

---

## Runtime API

| Method                   | Returns                 | Notes                                                                 |
| ------------------------ | ----------------------- | --------------------------------------------------------------------- |
| `getBucket()`            | `gcp.storage.Bucket`    | Underlying resource.                                                  |
| `getName()`              | `pulumi.Output<string>` | Bucket name.                                                          |
| `getUrl()`               | `pulumi.Output<string>` | `gs://…` URL.                                                         |
| `exportOutputs(manager)` | –                       | Registers bucket(s) under `gcp:storage:Bucket` in `CloudInfraOutput`. |

Bulk component additionally exposes `getBuckets()`, `getBucket(name)`, `getName(name)` and `getUrl(name)` helper methods.

---

## Behaviour notes

1. Supplying `location` in `config` is **illegal** – location is always derived.
2. Invalid dual-region combinations throw early at preview time.
3. Resource names follow the standard `<prefix>-<name>-<suffix>` convention.

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraApplicationLoadBalancer`](../alb/README.md) – Load balancers that reference bucket URLs for static sites
- [`CloudInfraServiceAccount`](../account/README.md) – Service accounts for bucket access
- [`CloudInfraRole`](../role/README.md) – Custom roles for bucket permissions
- [`CloudInfraSecretVersion`](../secret/README.md) – Secrets for bucket access keys

### Organization Modules

- [`CloudInfraServiceProject`](../../organization/project/README.md) – Projects where buckets are created
- [`CloudInfraRepository`](../../organization/repository/README.md) – Artifact Registry with similar naming/location logic
- [`CloudInfraFolder`](../../organization/folder/README.md) – Folder organization for bucket resources

---

## See Also

- [GCP Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Storage Best Practices](https://cloud.google.com/storage/docs/best-practices)
- [Application Load Balancer Integration](../alb/README.md)
- [Project Management](../../organization/project/README.md)
- [Artifact Registry](../../organization/repository/README.md)
