# Compute Instance (`CloudInfraComputeInstance`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers with sensible
> defaults and CloudInfra naming conventions.
>
> Provisions a Compute Engine **instance** (`gcp.compute.Instance`) with
> automatic zonal naming and standardized meta integration.

---

## Quick reference

```ts
import { CloudInfraMeta, CloudInfraComputeInstance } from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraComputeInstance(name, args)`
- Helpful getters – `.getInternalIp()`, `.getExternalIp()`, `.getZone()`
- Stack outputs – `.exportOutputs(outputManager)`

---

## Usage examples

### 1. Basic web server instance (name-first, preferred)

```ts
export const webServerInstance = new CloudInfraComputeInstance('web-server', {
  domain: 'au',
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

The single args object splits into naming metadata (`domain` / `location` /
`prefix` / `naming`) and the instance config (everything else, passed straight
through to `gcp.compute.Instance`). `machineType`, `bootDisk` and
`networkInterfaces` are required.

### 2. Database instance with custom zone and service account (name-first)

```ts
export const databaseInstance = new CloudInfraComputeInstance('database', {
  domain: 'us',
  zone: 'us-central1-b', // Override default zone (instance-level placement)
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

> **Zonal note:** `zone` is an instance-level placement field on the config and
> is distinct from the naming `location`. If `zone` is omitted, the zone defaults
> to `<region>-a` derived from meta.

### 3. Instance with a project override (name-first)

`gcpProject` maps to the name-first `project:` config field — there is no need
to drop to meta-first for a project override.

```ts
export const webServerInstance = new CloudInfraComputeInstance('web-server', {
  domain: 'au',
  project: 'my-project', // maps to meta's gcpProject
  machineType: 'e2-micro',
  bootDisk: { initializeParams: { image: 'debian-cloud/debian-11' } },
  networkInterfaces: [{ network: 'default' }],
});
```

> **@deprecated** Meta-first construction (`new CloudInfraComputeInstance(meta, config)`)
> is retained for backward compatibility and produces **identical** resources.
> The only reason to reach for it is `overrideNamingRules` (a `CloudInfraMeta`
> schema field with no name-first/config equivalent); `gcpProject` and the
> `omit*` flags all have name-first equivalents (`project:` / `naming`).

---

## Outputs

The component participates in the v2 output wire via `exportOutputs`:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();
webServerInstance.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); //             legacy nested wire
```

`exportOutputs` records the instance under `gcp:compute:Instance`. See
[`core/output`](../../core/output) and [`core/reference`](../../core/reference)
for the full wire format and for consuming these outputs cross-stack via
`ref.get(...)`.

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
