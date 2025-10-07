# Application Load-Balancer (`CloudInfraAlb`)

> Part of **`@mutinex/cloud-infra`** – opinionated Pulumi helpers for GCP.
>
> Creates an **external HTTP / HTTPS Application Load-Balancer** (global or
> regional) with minimal boilerplate. The component wires up IP address,
> forwarding rule, target proxy, URL map and optional SSL certificate so you can
> focus on backend services.

---

## Quick reference

```ts
import { CloudInfraMeta, CloudInfraAlb } from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraAlb(meta, config?)`
- Outputs – `alb.getForwardingRule()`, `alb.getIpAddress()`, `alb.getUrlMap()`, `alb.getProxy()`, `alb.getCertificate()`
- Stack outputs – `alb.exportOutputs(outputManager)`

---

## Supported scenarios

`CloudInfraAlb` supports the following load balancer configurations:

| Scenario                    | Scope          | Load Balancing Scheme | Certificate Support                               | Status               |
| --------------------------- | -------------- | --------------------- | ------------------------------------------------- | -------------------- |
| **Global External HTTP**    | Global         | `EXTERNAL`            | N/A                                               | ✅ Supported         |
| **Global External HTTPS**   | Global         | `EXTERNAL`            | Compute SSL, Certificate Map, Certificate Manager | ✅ Supported         |
| **Regional External HTTP**  | Regional       | `EXTERNAL`            | N/A                                               | ✅ Supported         |
| **Regional External HTTPS** | Regional       | `EXTERNAL`            | Compute SSL, Certificate Manager                  | ✅ Supported         |
| **Regional Internal HTTP**  | Regional       | `INTERNAL_MANAGED`    | N/A                                               | ✅ Supported         |
| **Regional Internal HTTPS** | Regional       | `INTERNAL_MANAGED`    | Compute SSL, Certificate Manager                  | ✅ Supported         |
| **Multi-Regional Internal** | Multi-Regional | `INTERNAL_MANAGED`    | Any                                               | ❌ Not supported yet |

> **Note**: Multi-regional internal load balancers are not currently supported. Use regional internal load balancers for internal traffic within a specific region.

---

## Usage examples

### 1. Global HTTPS load-balancer (Compute SSL)

```ts
const meta = new CloudInfraMeta({
  name: 'api',
  domain: 'gl', // "gl" → global resources
});

const alb = new CloudInfraAlb(meta, {
  portRange: '443',
  target: {
    sslCertificates: {
      certificate: '-----BEGIN CERTIFICATE-----…',
      privateKey: '-----BEGIN PRIVATE KEY-----…',
    },
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### 2. Global HTTPS load-balancer (Certificate Map)

```ts
import { CloudInfraCertificateMap } from '@mutinex/cloud-infra';

// Create managed certificates
const cert = new CloudInfraCertificateMap(certMeta, {
  certificates: [
    {
      name: 'api',
      domains: ['api.organization.co'],
      wildcard: true,
    },
  ],
  cloudflareZoneId: 'your-zone-id',
});

const alb = new CloudInfraAlb(meta, {
  portRange: '443',
  target: {
    certificateMap: cert.getCertificateMap()!.id,
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### 3. Regional HTTPS load-balancer (Certificate Manager)

```ts
const regionalMeta = new CloudInfraMeta({
  name: 'regional-api',
  domain: 'au',
  location: 'australia-southeast1',
});

const regionalCert = new CloudInfraCertificateMap(regionalCertMeta, {
  certificates: [
    {
      name: 'frontend',
      domains: ['app.organization.co'],
      wildcard: true,
    },
  ],
  cloudflareZoneId: 'your-zone-id',
});

const alb = new CloudInfraAlb(regionalMeta, {
  portRange: '443',
  network: baseNetwork,
  target: {
    certificateManagerCertificates: [
      regionalCert.getManagedCertificate('frontend')!.id,
    ],
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### 4. Regional Internal HTTPS load-balancer

```ts
const internalMeta = new CloudInfraMeta({
  name: 'internal-api',
  domain: 'au',
  location: 'australia-southeast1',
});

const alb = new CloudInfraAlb(internalMeta, {
  portRange: '443',
  loadBalancingScheme: 'INTERNAL_MANAGED',
  network: baseNetwork,
  subnetwork: subnet,
  target: {
    certificateManagerCertificates: [
      cert.getManagedCertificate('internal-app')!.id,
    ],
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### 5. Regional HTTP load-balancer

```ts
const meta = new CloudInfraMeta({
  name: 'web',
  domain: 'au',
  // optional – overrides the default region derived from domain
  location: 'australia-southeast1',
});

const alb = new CloudInfraAlb(meta, {
  region: 'australia-southeast1',
  portRange: '80',
  target: {
    urlMap: { defaultService: backendService.getId() },
  },
});
```

---

## Configuration

`CloudInfraAlb` accepts **all** fields from
`gcp.compute.GlobalForwardingRuleArgs` (for global) **or**
`gcp.compute.ForwardingRuleArgs` (for regional) **plus** these extras:

| Field                                   | Type                                                                         | Description                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `region`                                | `string`                                                                     | (Regional only) Override the region derived from `CloudInfraMeta`.                                    |
| `ipAddress`                             | `string \| gcp.compute.*AddressArgs`                                         | Existing static IP address **or** a spec for creating a new one.                                      |
| `target`                                | `string \| TargetProxyConfig`                                                | Existing target proxy reference **or** configuration to create a new one.                             |
| `target.sslCertificates`                | `{ certificate: string; privateKey: string; } & Partial<SSLCertificateArgs>` | If provided an **HTTPS** proxy is created; otherwise an **HTTP** proxy is used.                       |
| `target.certificateMap`                 | `string`                                                                     | Certificate map ID for global HTTPS load balancers. See [`certificate`](../certificatemap) component. |
| `target.certificateManagerCertificates` | `string[]`                                                                   | Array of Certificate Manager certificate IDs. See [`certificate`](../certificatemap) component.       |
| `target.urlMap`                         | `string \| Partial<gcp.compute.(Region)URLMapArgs>`                          | Existing URL map reference **or** configuration to create a new one.                                  |

---

## Abstracted resources

- **Static IP** – `gcp.compute.GlobalAddress` **or** `gcp.compute.Address`
- **URL-map** – `gcp.compute.URLMap` **or** `RegionUrlMap`
- **Target proxy** – HTTPS / HTTP (global or regional)
- **Forwarding rule** – `GlobalForwardingRule` **or** `ForwardingRule`
- **SSL certificate** – `gcp.compute.SSLCertificate` (only when provided)

All resource names follow `CloudInfraMeta` naming rules.

---

## Runtime API

| Method                   | Returns                                            | Notes                                                                              |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `getForwardingRule()`    | Global or regional forwarding rule resource.       |                                                                                    |
| `getIpAddress()`         | `pulumi.Output<string>`                            | Public IP address of the load-balancer.                                            |
| `getAddressResource()`   | Address resource (if created) or `undefined`.      | Use to attach IAM policies etc.                                                    |
| `getUrlMap()`            | URL map resource (if created) or `undefined`.      | Returns the URL map created by the component.                                      |
| `getProxy()`             | Target proxy resource (if created) or `undefined`. | Returns the HTTP/HTTPS proxy created by the component.                             |
| `getCertificate()`       | SSL certificate (if created) or `undefined`.       | Returns the SSL certificate created for HTTPS proxies.                             |
| `exportOutputs(manager)` | –                                                  | Registers the address under `gcp:compute:(Global)Address` in a `CloudInfraOutput`. |

---

## Behaviour notes

1. **Global vs regional** is inferred from `meta.domain` (`gl` → global). For
   regional domains you can override the specific region via `config.region`.
2. **HTTP vs HTTPS**: supplying `target.sslCertificates` automatically switches
   to HTTPS and attaches the certificate.
3. **Defaults**: if `portRange` is omitted it defaults to `80`; an external IP
   address is created unless you supply `ipAddress`.

4. **Forwarding Rule Target Format:** `GlobalForwardingRule.target` and `ForwardingRule.target` must use the full in-project URL (selfLink) of the `TargetHttpsProxy` or `TargetHttpProxy` resource rather than its numeric `id`. For example:

```ts
// Example: forwarding rule target uses proxy selfLink
const forwardingRule = new gcp.compute.GlobalForwardingRule('exampleFr', {
  target: alb.getProxy().selfLink,
  // ...other required args
});
```

5. **Pass-through configuration**: All native Pulumi forwarding rule arguments are supported and passed through directly, allowing full customization while maintaining sensible defaults from metadata.

---

## See also

- [`components/certificate`](../certificatemap) – managed SSL certificates with DNS validation for HTTPS load balancers.
- [`components/backendservice`](../backendservice) – backend services that can be used with this ALB.
- [`core/meta`](../../core/meta) – naming & location helpers.
- [`core/output`](../../core/output) – structured stack outputs.
