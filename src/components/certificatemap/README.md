# Certificate Management (`CloudInfraCertificateMap`)

> Part of **`@mutinex/cloud-infra`** – opinionated Pulumi helpers for GCP.
>
> Creates **managed SSL certificates** with DNS validation through Google Certificate Manager. Supports both global and regional certificates with automatic Cloudflare DNS record creation for domain validation.

---

## Quick reference

```ts
import { CloudInfraMeta, CloudInfraCertificateMap } from '@mutinex/cloud-infra';
```

- Constructor – `new CloudInfraCertificateMap(name, args)`
- Outputs – `cert.getManagedCertificate(key)`, `cert.getCertificateMap()`, `cert.getDomains(certName?)`
- Stack outputs – `cert.exportOutputs(outputManager)`

---

## Usage examples

### 1. Global certificates with certificate map (name-first, preferred)

Global certificates (`domain: 'gl'`) support certificate maps for use with
global load balancers:

```ts
const globalCert = new CloudInfraCertificateMap('global-certs', {
  domain: 'gl', // "gl" → global resources (+ certificate map)
  certificates: [
    {
      name: 'frontend',
      domains: ['app.organization.co'],
      wildcard: false,
    },
    {
      name: 'api',
      domains: ['api.organization.co'],
      wildcard: true, // Creates both api.organization.co and *.api.organization.co
    },
  ],
  cloudflareZoneId: 'your-cloudflare-zone-id',
});

// Use with global ALB certificate map
const alb = new CloudInfraAlb('app', {
  domain: 'gl',
  portRange: '443',
  target: {
    certificateMap: globalCert.getCertificateMap()!.id,
    urlMap: {
      defaultService: backendService.getId(),
    },
  },
});
```

The single args object splits into naming metadata (`domain` / `location` /
`prefix` / `naming`) and the certificate config (`certificates`,
`cloudflareZoneId`, optional `project`), passed straight through.

### 2. Regional certificates (name-first)

Regional certificates are created for specific regions and can be used with both regional and global load balancers:

```ts
const regionalCert = new CloudInfraCertificateMap('regional-certs', {
  domain: 'au', // non-"gl" domain → regional resources in Australia
  certificates: [
    {
      name: 'frontend',
      domains: ['app.organization.co'],
      wildcard: true, // Creates wildcard certificates for the domain
    },
    {
      name: 'api',
      domains: ['api.organization.co'],
      wildcard: false,
    },
  ],
  cloudflareZoneId: 'your-cloudflare-zone-id',
});

// Use with regional ALB
const regionalAlb = new CloudInfraAlb('app', {
  domain: 'au',
  portRange: '443',
  network: baseNetwork,
  target: {
    certificateManagerCertificates: [
      regionalCert.getManagedCertificate('frontend')!.id,
    ],
    urlMap: {
      defaultService: backendService.getId(),
    },
  },
});
```

### 3. Multiple certificates with different configurations (name-first)

```ts
const multiCert = new CloudInfraCertificateMap('multi-certs', {
  domain: 'gl',
  certificates: [
    {
      name: 'frontend',
      domains: ['app.organization.co', 'organization.co'],
      wildcard: false, // Exact domains only
    },
    {
      name: 'api',
      domains: ['api.organization.co'],
      wildcard: true, // Both api.organization.co and *.api.organization.co
    },
    {
      name: 'demo',
      domains: ['demo-au.organization.co', 'demo-us.organization.co'],
      wildcard: false,
    },
  ],
  cloudflareZoneId: 'your-cloudflare-zone-id',
});

// Access specific certificates
const frontendCert = multiCert.getManagedCertificate('frontend');
const apiCert = multiCert.getManagedCertificate('api');
```

### 4. Global preview map with a project override

`gcpProject` maps to the name-first `project:` config field, and a preview name
is selected with `naming: { preview: '<token>' }` (preview wins over the
location formula, producing `prefix-name-hash7`).

```ts
const globalCert = new CloudInfraCertificateMap('global-certs', {
  naming: { preview: 'dev' }, // prefix-name-hash7(dev)
  project: 'my-project', // maps to meta's gcpProject
  certificates: [
    { name: 'api', domains: ['api.organization.co'], wildcard: true },
  ],
  cloudflareZoneId: 'your-cloudflare-zone-id',
});
```

> **@deprecated** Meta-first construction (`new CloudInfraCertificateMap(meta, config)`)
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
globalCert.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); //             legacy nested wire
```

`exportOutputs` records the certificate map under
`gcp:certificatemanager:CertificateMap` (global certificates only). See
[`core/output`](../../core/output) and [`core/reference`](../../core/reference)
for the full wire format and for consuming these outputs cross-stack via
`ref.get(...)`.

---

## Integration with ALB

The certificate component integrates seamlessly with [`CloudInfraAlb`](../alb) in multiple ways:

### Global ALB with Certificate Map

```ts
// Global certificate with certificate map
const globalCert = new CloudInfraCertificateMap(globalMeta, {
  /* config */
});

const globalAlb = new CloudInfraAlb(albMeta, {
  portRange: '443',
  target: {
    certificateMap: globalCert.getCertificateMap()!.id,
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### Global ALB with Certificate Manager Certificates

```ts
// Global certificate used as managed certificate
const globalCert = new CloudInfraCertificateMap(globalMeta, {
  /* config */
});

const globalAlb = new CloudInfraAlb(albMeta, {
  portRange: '443',
  target: {
    certificateManagerCertificates: [
      globalCert.getManagedCertificate('api')!.id,
    ],
    urlMap: { defaultService: backendService.getId() },
  },
});
```

### Regional ALB with Certificate Manager Certificates

```ts
// Regional certificate
const regionalCert = new CloudInfraCertificateMap(regionalMeta, {
  /* config */
});

const regionalAlb = new CloudInfraAlb(albMeta, {
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

### Internal ALB with Certificate Manager Certificates

```ts
// Regional certificate for internal load balancer
const internalCert = new CloudInfraCertificateMap(regionalMeta, {
  /* config */
});

const internalAlb = new CloudInfraAlb(albMeta, {
  portRange: '443',
  loadBalancingScheme: 'INTERNAL_MANAGED',
  network: baseNetwork,
  subnetwork: subnet,
  target: {
    certificateManagerCertificates: [
      internalCert.getManagedCertificate('internal-app')!.id,
    ],
    urlMap: { defaultService: backendService.getId() },
  },
});
```

---

## Configuration

### CloudInfraCertificateMapConfig

| Field              | Type                      | Description                                   |
| ------------------ | ------------------------- | --------------------------------------------- |
| `certificates`     | `CertificateDefinition[]` | Array of certificate definitions to create    |
| `cloudflareZoneId` | `string`                  | Cloudflare Zone ID for DNS validation records |

### CertificateDefinition

| Field            | Type       | Description                                         |
| ---------------- | ---------- | --------------------------------------------------- |
| `name`           | `string`   | Name identifier for the certificate                 |
| `domains`        | `string[]` | List of domains to include in the certificate (SAN) |
| `wildcard`       | `boolean?` | Whether to include wildcard domains (\*.domain)     |
| `includePreview` | `boolean?` | Whether to include preview domain wildcards         |

---

## Abstracted resources

### Global Certificates (domain === 'gl')

- **DNS Authorizations** – `gcp.certificatemanager.DnsAuthorization` (global)
- **Cloudflare Records** – `cloudflare.DnsRecord` for validation
- **Managed Certificates** – `gcp.certificatemanager.Certificate` (global)
- **Certificate Map** – `gcp.certificatemanager.CertificateMap` (global only)
- **Certificate Map Entries** – `gcp.certificatemanager.CertificateMapEntry`

### Regional Certificates (domain !== 'gl')

- **DNS Authorizations** – `gcp.certificatemanager.DnsAuthorization` (regional)
- **Cloudflare Records** – `cloudflare.DnsRecord` for validation
- **Managed Certificates** – `gcp.certificatemanager.Certificate` (regional)

All resource names follow `CloudInfraMeta` naming rules.

---

## Runtime API

| Method                       | Returns                                              | Notes                                                                                |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `getManagedCertificate(key)` | `gcp.certificatemanager.Certificate \| undefined`    | Get a specific certificate by name. Works for both global and regional certificates. |
| `getCertificateMap()`        | `gcp.certificatemanager.CertificateMap \| undefined` | Get certificate map. Only available for global certificates.                         |
| `getDomains(certName?)`      | `pulumi.Output<string[]> \| undefined`               | Get domains from certificate(s). If certName omitted, returns all domains.           |
| `exportOutputs(manager)`     | –                                                    | Registers certificate map under `gcp:certificatemanager:CertificateMap`.             |

---

## Behavior notes

1. **Global vs Regional**: Determined by `meta.domain`. Global certificates (`domain === 'gl'` or `omitDomain: true`) support certificate maps. Regional certificates do not.

2. **Certificate Maps**: Only created for global certificates. Use `getCertificateMap()` for global load balancers with certificate map support.

3. **Wildcard Certificates**: When `wildcard: true`, both exact domains and wildcard domains (`*.domain`) are included in the certificate.

4. **DNS Validation**: Automatically creates Cloudflare DNS records for domain validation. Requires valid Cloudflare Zone ID.

5. **Resource Naming**: Domain names are sanitized for GCP resource naming:
   - Converted to lowercase
   - Wildcards (\*) replaced with 'star'
   - Dots replaced with hyphens
   - Truncated to 32 characters

6. **Location Handling**:
   - Global resources: No location parameter
   - Regional resources: Location derived from meta domain

---

## Domain validation process

1. **DNS Authorization**: Creates GCP Certificate Manager DNS authorization for each domain
2. **Cloudflare Records**: Automatically creates CNAME records in Cloudflare for validation
3. **Certificate Creation**: Creates managed certificate with DNS validation
4. **Certificate Map** (Global only): Creates certificate map and entries for domain routing

The validation process is fully automated - certificates will be issued once DNS propagation completes.

---

## Error handling

- **ValidationError**: Thrown for invalid configurations (e.g., array input names, accessing certificate maps on regional certificates)
- **ResourceError**: Thrown for resource creation failures
- **Automatic Cleanup**: Resources are created with `deleteBeforeReplace: true` for safe updates

---

## See also

- [`components/alb`](../alb) – Application Load Balancer that uses these certificates
- [`core/meta`](../../core/meta) – Naming & location helpers
- [`core/output`](../../core/output) – Structured stack outputs
- [Google Certificate Manager Documentation](https://cloud.google.com/certificate-manager/docs)
- [Cloudflare DNS API Documentation](https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record)
