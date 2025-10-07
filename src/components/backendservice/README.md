# Backend Service (`CloudInfraBackendService`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers that respect
> CloudInfra naming conventions.
>
> Creates a **global** (`gcp.compute.BackendService`) or **regional**
> (`gcp.compute.RegionBackendService`) backend service and, optionally, a global
> HTTP health-check that is automatically attached.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraBackendService,
} from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraBackendService(meta, config?)`
- Outputs – `svc.getId()`, `svc.getBackendService()`
- Stack outputs – `svc.exportOutputs(outputManager)`

---

## Usage examples

### 1. Global backend with Cloud Run integration

```ts
const apiGlobalBackendServiceMeta = new CloudInfraMeta({
  name: 'api-default',
  omitDomain: true,
  gcpProject: 'my-project',
  preview: 'dev',
});

const apiGlobalBackendService = new CloudInfraBackendService(
  apiGlobalBackendServiceMeta,
  {
    project: 'my-project',
    backends: [
      {
        group: apiAuService.getNetworkEndpointGroup().id,
      },
    ],
    healthCheck: {
      requestPath: '/health',
      port: 8080,
    },
  }
);
```

### 2. Regional backend with health check

```ts
const regionalMeta = new CloudInfraMeta({
  name: 'frontend',
  domain: 'au',
  gcpProject: 'my-project',
});

const regionalBackend = new CloudInfraBackendService(regionalMeta, {
  backends: [{ group: frontendService.getNetworkEndpointGroup().id }],
  healthCheck: {
    requestPath: '/health',
    port: 3000,
  },
});
```

---

## Configuration

The constructor accepts the union of the following Pulumi argument types plus a
small CloudInfra-specific extension:

- `gcp.compute.BackendServiceArgs` (global)
- `gcp.compute.RegionBackendServiceArgs` (regional)

Additional field:

| Field         | Type                                                                              | Default | Description                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `healthCheck` | `{ requestPath?: string; port?: number; } & Partial<gcp.compute.HealthCheckArgs>` | –       | If supplied, a **global** `gcp.compute.HealthCheck` is created and its ID appended to the backend-service. `requestPath` defaults to `/`, `port` to `80`. |

---

## Defaults & behaviour

1. **Protocol** and **load-balancing scheme** default to `HTTP` / `EXTERNAL_MANAGED` but can be overridden via `config`.
2. **Region** for regional services is derived from `CloudInfraMeta`'s location unless `config.region` is set.
3. Omitting `healthCheck` results in a backend service without attached checks – useful when you reference an existing check.
4. All resource names follow the standard `CloudInfraMeta` pattern.

---

## Runtime API

| Method                   | Returns                                      | Notes                                                                          |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `getBackendService()`    | Global or regional backend-service resource. |                                                                                |
| `getId()` / `getName()`  | `pulumi.Output<string>`                      | Helpful when wiring into other resources.                                      |
| `exportOutputs(manager)` | –                                            | Records backend-service (and health-check if present) in a `CloudInfraOutput`. |

---

## See also

- [`components/alb`](../alb) – Application Load-Balancer that consumes backend-services.
- [`core/meta`](../../core/meta) – naming & location helpers.
- [`core/output`](../../core/output) – structured stack outputs.
