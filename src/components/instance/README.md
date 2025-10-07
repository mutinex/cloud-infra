# Compute Instance (`CloudInfraComputeInstance`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers with sensible
> defaults and CloudInfra naming conventions.
>
> Provisions a Compute Engine **instance** (`gcp.compute.Instance`) with
> automatic zonal naming and standardized meta integration.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraComputeInstance,
} from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraComputeInstance(meta, config)`
- Helpful getters – `.getInternalIp()`, `.getExternalIp()`, `.getZone()`
- Stack outputs – `.exportOutputs(outputManager)`

---

## Usage examples

### 1. Basic web server instance

```ts
const webServerMeta = new CloudInfraMeta({
  name: 'web-server',
  domain: 'au',
  gcpProject: 'my-project',
});

export const webServerInstance = new CloudInfraComputeInstance(webServerMeta, {
  machineType: 'e2-micro',
  bootDisk: {
    initializeParams: {
      image: 'debian-cloud/debian-11',
    },
  },
  networkInterfaces: [
    {
      network: 'default',
      accessConfigs: [{}], // Assigns external IP
    },
  ],
  metadata: {
    'startup-script': `#!/bin/bash
      apt-get update
      apt-get install -y nginx
      systemctl start nginx`,
  },
  tags: ['web-server', 'http-server'],
});
```

### 2. Database instance with custom zone and service account

```ts
const dbMeta = new CloudInfraMeta({
  name: 'database',
  domain: 'us',
  gcpProject: 'my-project',
});

export const databaseInstance = new CloudInfraComputeInstance(dbMeta, {
  zone: 'us-central1-b', // Override default zone
  machineType: 'n1-standard-2',
  bootDisk: {
    initializeParams: {
      image: 'ubuntu-os-cloud/ubuntu-2004-lts',
      size: 50,
    },
  },
  networkInterfaces: [
    {
      network: 'vpc-network',
      subnetwork: 'private-subnet',
      // No accessConfigs = internal IP only
    },
  ],
  serviceAccount: {
    email: serviceAccount.email,
    scopes: ['cloud-platform'],
  },
  attachedDisks: [
    {
      source: dataDisk.name,
      deviceName: 'data-disk',
    },
  ],
});
```

---

## Configuration

Accepts all fields from `gcp.compute.InstanceArgs`. Required fields are validated:

- `machineType` – The machine type (e.g., `e2-micro`, `n1-standard-1`)
- `bootDisk` – Boot disk configuration with image and size
- `networkInterfaces` – Network configuration (at least one interface)

If `zone` is omitted, it defaults to `<region>-a` derived from meta.
If `project` is omitted, it uses `meta.getGcpProject()`.

---

## Runtime API

| Method                   | Returns                              | Notes                                     |
| ------------------------ | ------------------------------------ | ----------------------------------------- |
| `getInstance()`          | `gcp.compute.Instance`               | Underlying instance resource.             |
| `getName()`              | `pulumi.Output<string>`              | Instance name (with zonal suffix).        |
| `getZone()`              | `pulumi.Output<string>`              | Zone where instance is deployed.          |
| `getRegion()`            | `pulumi.Output<string>`              | Region extracted from zone.               |
| `getMachineType()`       | `pulumi.Output<string>`              | Instance machine type.                    |
| `getStatus()`            | `pulumi.Output<string>`              | Current instance status.                  |
| `getInternalIp()`        | `pulumi.Output<string>`              | Internal IP from first network interface. |
| `getExternalIp()`        | `pulumi.Output<string \| undefined>` | External IP if access config exists.      |
| `exportOutputs(manager)` | –                                    | Records under `gcp:compute:Instance`.     |

---

## Behaviour notes

1. **Zonal Naming**: When zone is a static string, resource names include the zone letter (e.g., `my-proj-web-server-au-se1a`).
2. **Zone Defaults**: If no zone specified, defaults to first zone in region (`<region>-a`).
3. **IP Access**: `getInternalIp()` reads from the first network interface; `getExternalIp()` from first access config.
4. **Access Matrix**: Fully supported for IAM management via `CloudInfraAccessMatrix`.

---

## See also

- [`core/meta`](../../core/meta) – naming & location helpers with zonal support.
- [`core/access-matrix`](../../core/access-matrix) – IAM management for instances.
- [`core/output`](../../core/output) – structured stack outputs.
