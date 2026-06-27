# Cloud Run Job (`CloudInfraCloudRunJob`)

> Part of **`@mutinex/cloud-infra`** – opinionated Pulumi helpers for GCP.
>
> A thin wrapper around `gcp.cloudrunv2.Job` that automatically derives the
> region from [`CloudInfraMeta`](../../core/meta) and applies CloudInfra naming
> conventions. No side-effect resources (like schedules or service-accounts)
> are created – you remain in full control.

---

## Quick reference

```ts
import { CloudInfraCloudRunJob } from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraCloudRunJob(name, config?)`
- Outputs – `.getJob()`, `.getName()`
- Stack outputs – `.exportOutputs(outputManager)`

---

## Usage examples

### 1. Minimal job (region derived automatically)

```ts
const job = new CloudInfraCloudRunJob('data-sync', {
  domain: 'us',
  template: {
    template: {
      containers: [{ image: 'gcr.io/my-prj/data-sync:latest' }],
    },
  },
});
```

### 2. Override region and add environment variables

```ts
const job = new CloudInfraCloudRunJob('report', {
  domain: 'au',
  location: 'australia-southeast1', // explicit override
  template: {
    template: {
      containers: [
        {
          image: 'gcr.io/my-prj/report:latest',
          env: [{ name: 'ENV', value: 'staging' }],
        },
      ],
    },
  },
});
```

_(Two examples total – no bulk version of Cloud Run jobs exists.)_

---

## Configuration

Accepts every field from `gcp.cloudrunv2.JobArgs`. On the name-first surface,
`location` is naming metadata: it both drives the generated name and resolves
the deployment region via `deriveRegion(meta)`. If omitted, the region is
derived from `domain`.

---

## Defaults & behaviour

1. **Name** derives from the resolved `CloudInfraMeta`.
2. **Region** derived from the naming `location` / `domain` via
   `deriveRegion(meta)`.
3. Resource names follow the standard CloudInfra naming convention.

---

## Runtime API

| Method                   | Returns                 | Notes                                                               |
| ------------------------ | ----------------------- | ------------------------------------------------------------------- |
| `getJob()`               | `gcp.cloudrunv2.Job`    | Underlying resource.                                                |
| `getName()`              | `pulumi.Output<string>` | Job name.                                                           |
| `exportOutputs(manager)` | –                       | Records the job under `gcp:cloudrunv2:Job` in a `CloudInfraOutput`. |

---

## Outputs

The component participates in the v2 output wire via `exportOutputs`:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();
job.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); //             legacy nested wire
```

`exportOutputs` records the job under `gcp:cloudrunv2:Job`. See
[`core/output`](../../core/output) and [`core/reference`](../../core/reference)
for the full wire format and for consuming these outputs cross-stack via
`ref.get(...)`.

> **Meta-first (deprecated):** `new CloudInfraCloudRunJob(meta, config)` is
> retained for backward compatibility and produces **identical** resources; the
> name-first form shown above is preferred. Meta-first also exposes a
> config-level `location` override (a region different from the naming location).

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraCloudRunService`](../cloudrunservice/README.md) – Deploy services instead of jobs
- [`CloudInfraServiceAccount`](../account/README.md) – Service accounts for job execution
- [`CloudInfraRole`](../role/README.md) – Custom roles for job permissions
- [`CloudInfraSecretVersion`](../secret/README.md) – Secrets consumed by jobs
- [`CloudInfraBucket`](../bucket/README.md) – Storage buckets accessed by jobs

### Organization Modules

- [`CloudInfraServiceProject`](../../organization/project/README.md) – Projects where jobs are deployed
- [`CloudInfraConnector`](../../organization/network/README.md) – VPC connectors for private network access
- [`CloudInfraFolder`](../../organization/folder/README.md) – Folder organization for job resources

---

## See Also

- [GCP Cloud Run Jobs Documentation](https://cloud.google.com/run/docs/create-jobs)
- [Cloud Run Best Practices](https://cloud.google.com/run/docs/best-practices)
- [Cloud Run Services](../cloudrunservice/README.md)
- [VPC Connector Integration](../../organization/network/README.md)
- [Project Management](../../organization/project/README.md)
