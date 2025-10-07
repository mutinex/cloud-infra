# Cloud Run Service (`CloudInfraCloudRunService`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers with sensible
> defaults and CloudInfra naming conventions.
>
> Provisions a Cloud Run **service** (`gcp.cloudrunv2.Service`) and an
> associated **regional Network-Endpoint Group** so the service can be plugged
> into an external HTTP(S) Load Balancer without extra boilerplate.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraCloudRunService,
} from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraCloudRunService(meta, config?)`
- Helpful getters – `.getUri()`, `.getNetworkEndpointGroup()`
- Stack outputs – `.exportOutputs(outputManager)`

---

## Usage examples

### 1. API service with VPC access and scaling

```ts
const apiAuServiceMeta = new CloudInfraMeta({
  name: 'api',
  domain: 'au',
  location: 'australia-southeast1',
  preview: previewName,
});

export const apiAuService = new CloudInfraCloudRunService(apiAuServiceMeta, {
  project: gcpProjectId,
  deletionProtection: false,
  ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
  template: {
    scaling: {
      minInstanceCount: 0,
      maxInstanceCount: 10,
    },
    containers: [
      {
        image: `australia-southeast1-docker.pkg.dev/my-project/api:latest`,
        envs: getApiEnvs(),
        ports: {
          containerPort: 8080,
        },
        resources: {
          cpuIdle: true,
          limits: {
            memory: '512Mi',
            cpu: '1000m',
          },
          startupCpuBoost: true,
        },
      },
    ],
    maxInstanceRequestConcurrency: 100,
    vpcAccess: {
      connector: connectorAuSe1,
      egress: 'ALL_TRAFFIC',
    },
    serviceAccount: saAu?.getAccount('api')?.email,
  },
});
```

### 2. Frontend service with multi-region deployment

```ts
const frontendAuMeta = new CloudInfraMeta({
  name: 'frontend',
  domain: 'au',
  location: 'australia-southeast1',
  preview: previewName,
});

export const frontendAuService = new CloudInfraCloudRunService(frontendAuMeta, {
  project: gcpProjectId,
  deletionProtection: false,
  ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
  template: {
    containers: [
      {
        image: `australia-southeast1-docker.pkg.dev/my-project/frontend:latest`,
        envs: getFrontendEnvs(),
        ports: {
          containerPort: 3000,
        },
        resources: {
          cpuIdle: true,
          startupCpuBoost: true,
        },
      },
    ],
    vpcAccess: {
      connector: connectorAuSe1,
      egress: 'ALL_TRAFFIC',
    },
    maxInstanceRequestConcurrency: 80,
    serviceAccount: saAu?.getAccount('frontend')?.email,
  },
});
```

---

## Configuration

Accepts all fields from `gcp.cloudrunv2.ServiceArgs`. If `location` is omitted
it is resolved via `deriveRegion(meta)`.

A regional **NetworkEndpointGroup** is always created alongside the service; it
is named identically and parented to the service resource.

---

## Runtime API

| Method                          | Returns                                  | Notes                                               |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `getService()`                  | `gcp.cloudrunv2.Service`                 | Underlying service resource.                        |
| `getName()`                     | `pulumi.Output<string>`                  | Service name.                                       |
| `getUri()`                      | `pulumi.Output<string>`                  | Fully qualified HTTPS URI.                          |
| `getLocation()` / `getRegion()` | `pulumi.Output<string>`                  | Region where the service runs.                      |
| `getNetworkEndpointGroup()`     | `gcp.compute.RegionNetworkEndpointGroup` | Automatically created NEG.                          |
| `exportOutputs(manager)`        | –                                        | Records the service under `gcp:cloudrunv2:Service`. |

---

## Behaviour notes

1. The NEG is created in the same region as the service and uses `SERVERLESS`
   endpoints.
2. Resource names follow CloudInfra conventions derived from `CloudInfraMeta`.

---

## See also

- [`components/cloudrunjob`](../cloudrunjob) – run ad-hoc jobs instead of services.
- [`components/backendservice`](../backendservice) – use the NEG's ID as a backend.
- [`core/meta`](../../core/meta) – naming & location helpers.
- [`core/output`](../../core/output) – structured stack outputs.
