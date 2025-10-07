# Network Helpers (`@mutinex/cloud-infra`)

Opinionated wrappers around the most frequently-used Google Cloud networking
building blocks:

| Component                               | Purpose                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`CloudInfraSubnet`](./subnet.ts)       | Create a regional VPC _subnetwork_ whose region & name are derived from [`CloudInfraMeta`](../../core/meta/README.md). |
| [`CloudInfraConnector`](./connector.ts) | Provision a **Serverless VPC Access Connector** so Cloud Run / Functions can reach private RFC-1918 resources.         |
| [`CloudInfraPSA`](./psa.ts)             | Establish **Private Service Access** peering between a VPC and a Google-managed service (e.g. Cloud SQL).              |
| [`CloudInfraNat`](./nat.ts)             | Deploy a **NAT Gateway** with Router and RouterNat resources for outbound internet access from private subnets.        |

All components integrate with the core [`CloudInfraOutput`](../../core/output/README.md) and
[`CloudInfraReference`](../../core/reference/README.md) helpers for cross-stack
outputs.

---

## Quick-start

```typescript
import {
  CloudInfraMeta,
  CloudInfraSubnet,
  CloudInfraConnector,
  CloudInfraPSA,
  CloudInfraNat,
} from '@mutinex/cloud-infra';

// Shared meta – forces region & naming conventions
const meta = new CloudInfraMeta({
  name: 'network-demo',
  location: 'us-central1',
});

// 1️⃣ Subnetwork (10.0.1.0/24)
const subnet = new CloudInfraSubnet(meta, {
  network: 'projects/core-vpc/global/networks/shared',
  ipCidrRange: '10.0.1.0/24',
});

// 2️⃣ Serverless VPC Connector
const connector = new CloudInfraConnector(meta, {
  subnet: {
    name: subnet.getName(),
    projectId: 'core-vpc',
  },
});

// 3️⃣ Private Service Access to Cloud SQL (Service Networking default)
const psa = new CloudInfraPSA(meta, {
  network: 'projects/core-vpc/global/networks/shared',
  reservedPeeringRanges: [
    {
      purpose: 'VPC_PEERING',
      addressType: 'INTERNAL',
      prefixLength: 24,
      network: 'projects/core-vpc/global/networks/shared',
    },
  ],
});

// 4️⃣ NAT Gateway for private subnet outbound internet access
const nat = new CloudInfraNat(meta, {
  router: {
    network: 'projects/core-vpc/global/networks/shared',
  },
  sourceSubnetworkIpRangesToNat: 'LIST_OF_SUBNETWORKS',
  subnetworks: [
    {
      name: subnet.getSubnetwork().selfLink,
      sourceIpRangesToNats: ['ALL_IP_RANGES'],
    },
  ],
});
```

---

## Real-World Examples

The following examples are based on actual production infrastructure patterns:

### Multi-Region VPC Connector Setup

```ts
import * as pulumi from '@pulumi/pulumi';
import {
  CloudInfraMeta,
  CloudInfraSubnet,
  CloudInfraConnector,
  CloudInfraPSA,
} from '@mutinex/cloud-infra';
import { baseProject } from './projects';

const networkConfig = new pulumi.Config('cloudInfra');
const subnet = networkConfig.getObject<Record<string, string>>('network') ?? {};

// Private Service Access for Cloud SQL
const psaMeta = new CloudInfraMeta({
  name: 'psa',
  omitPrefix: true,
  omitDomain: true,
});

export const psa = new CloudInfraPSA(psaMeta, {
  network: baseProject.getSharedVpcName(),
  reservedPeeringRanges: [
    {
      project: baseProject.getProjectId(),
      purpose: 'VPC_PEERING',
      addressType: 'INTERNAL',
      prefixLength: 16,
      network: baseProject.getSharedVpcName(),
      address: subnet['psa'],
    },
  ],
});

// Australia Southeast 1 VPC Connector
const vconAuSe1Meta = new CloudInfraMeta({
  name: 'vcon',
  domain: 'au',
  omitPrefix: true,
  location: 'australia-southeast1',
});

export const vconSubnetAuSe1 = new CloudInfraSubnet(vconAuSe1Meta, {
  project: baseProject.getProjectId(),
  network: baseProject.getSharedVpcName(),
  ipCidrRange: subnet['vconAuSe1'],
});

export const vconAuSe1 = new CloudInfraConnector(vconAuSe1Meta, {
  project: baseProject.getProjectId(),
  subnet: {
    name: vconSubnetAuSe1.getName(),
    projectId: baseProject.getProjectId(),
  },
});

// US Central 1 VPC Connector
const vconUsC1Meta = new CloudInfraMeta({
  name: 'vcon',
  domain: 'us',
  omitPrefix: true,
  location: 'us-central1',
});

export const vconSubnetUsC1 = new CloudInfraSubnet(vconUsC1Meta, {
  project: baseProject.getProjectId(),
  network: baseProject.getSharedVpcName(),
  ipCidrRange: subnet['vconUsC1'],
});

export const vconUsC1 = new CloudInfraConnector(vconUsC1Meta, {
  project: baseProject.getProjectId(),
  subnet: {
    name: vconSubnetUsC1.getName(),
    projectId: baseProject.getProjectId(),
  },
});
```

### Regional Managed Proxy Subnet

```ts
// Proxy subnet for Application Load Balancer
const proxySubnetAuSe1Meta = new CloudInfraMeta({
  name: 'proxy-au-se1',
  domain: 'au',
  omitPrefix: true,
  omitDomain: true,
  location: 'australia-southeast1',
});

export const proxySubnetAuSe1 = new CloudInfraSubnet(proxySubnetAuSe1Meta, {
  project: baseProject.getProjectId(),
  purpose: 'REGIONAL_MANAGED_PROXY',
  role: 'ACTIVE',
  network: baseProject.getSharedVpcName(),
  ipCidrRange: subnet['proxyAuSe1'],
});
```

### Standard Regional Subnets

```ts
// Australia Southeast 1 subnet
const subnetAuSe1Meta = new CloudInfraMeta({
  name: 'subnet',
  domain: 'au',
  omitPrefix: true,
  location: 'australia-southeast1',
});

export const subnetAuSe1 = new CloudInfraSubnet(subnetAuSe1Meta, {
  project: baseProject.getProjectId(),
  network: baseProject.getSharedVpcName(),
  ipCidrRange: subnet['subnetAuSe1'],
});

// US Central 1 subnet
const subnetUsC1Meta = new CloudInfraMeta({
  name: 'subnet',
  domain: 'us',
  omitPrefix: true,
  location: 'us-central1',
});

export const subnetUsC1 = new CloudInfraSubnet(subnetUsC1Meta, {
  project: baseProject.getProjectId(),
  network: baseProject.getSharedVpcName(),
  ipCidrRange: subnet['subnetUsC1'],
});
```

---

## Component Details

### 1. `CloudInfraSubnet`

| Field               | Type                                                                                                                                 | Default      | Description                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------- |
| `network`           | `string`                                                                                                                             | **required** | Self-link of the parent VPC network.                     |
| `ipCidrRange`       | `string`                                                                                                                             | **required** | Primary IP range in CIDR notation (e.g. `10.10.0.0/24`). |
| `secondaryIpRanges` | `{ rangeName, ipCidrRange }[]`                                                                                                       | —            | Optional secondary ranges.                               |
| _(others)_          | Any [`gcp.compute.SubnetworkArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/compute/subnetwork/#inputs) minus `region`. |

Example – secondary ranges:

```ts
new CloudInfraSubnet(meta, {
  network: vpc.selfLink,
  ipCidrRange: '10.2.0.0/24',
  secondaryIpRanges: [
    { rangeName: 'pods', ipCidrRange: '10.2.1.0/24' },
    { rangeName: 'services', ipCidrRange: '10.2.2.0/24' },
  ],
});
```

### 2. `CloudInfraConnector`

| Field          | Type                                                                                                                                   | Default      | Description                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------ |
| `subnet`       | `{ name, projectId }`                                                                                                                  | **required** | Target subnetwork for the connector. |
| `machineType`  | `string`                                                                                                                               | `"e2-micro"` | Connector VM machine type.           |
| `minInstances` | `number`                                                                                                                               | `2`          | Autoscaling lower bound.             |
| `maxInstances` | `number`                                                                                                                               | `3`          | Autoscaling upper bound.             |
| _(others)_     | Any [`gcp.vpcaccess.ConnectorArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/vpcaccess/connector/#inputs) minus `region`. |

Example – custom scaling:

```ts
new CloudInfraConnector(meta, {
  subnet: { name: subnet.getName(), projectId: 'core-vpc' },
  minInstances: 4,
  maxInstances: 10,
});
```

### 3. `CloudInfraPSA`

| Field                   | Type                          | Default                              | Description                              |
| ----------------------- | ----------------------------- | ------------------------------------ | ---------------------------------------- |
| `network`               | `string`                      | **required**                         | VPC self-link.                           |
| `service`               | `string`                      | `"servicenetworking.googleapis.com"` | Service to peer with.                    |
| `reservedPeeringRanges` | `ReservedPeeringRangeInput[]` | —                                    | Preferred way to provide peering ranges. |
| `reservedRange`         | `ReservedRangeConfig`         | —                                    | Legacy single-range input (deprecated).  |
| `deletionPolicy`        | `"ABANDON" \| "DELETE"`       | `"ABANDON"`                          | Deletion strategy.                       |
| `project`               | `string`                      | provider project                     | Resource project.                        |

Example – alternative service (e.g. BigQuery Storage API):

```ts
new CloudInfraPSA(meta, {
  network: vpc.selfLink,
  service: 'bigquerystorage.googleapis.com',
  reservedPeeringRanges: [
    {
      purpose: 'VPC_PEERING',
      addressType: 'INTERNAL',
      prefixLength: 20,
      network: vpc.selfLink,
    },
  ],
});
```

### 4. `CloudInfraNat`

| Field      | Type                                                                                                                                           | Default      | Description                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| `router`   | [`gcp.compute.RouterArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/compute/router/#inputs) minus `region`                        | **required** | Configuration for new router creation. |
| _(others)_ | Any [`gcp.compute.RouterNatArgs`](https://www.pulumi.com/registry/packages/gcp/api-docs/compute/routernat/#inputs) minus `router` and `region` | —            | RouterNat configuration options.       |

The NAT component always creates a new router and defaults to `ALL_SUBNETWORKS_ALL_IP_RANGES` mode and `AUTO_ONLY` IP allocation for maximum flexibility.

Example – Basic NAT with default settings:

```ts
const nat = new CloudInfraNat(meta, {
  router: {
    network: 'projects/core-vpc/global/networks/shared',
    description: 'Router for NAT gateway',
  },
});
```

Example – NAT with specific subnetworks:

```ts
const nat = new CloudInfraNat(meta, {
  router: {
    network: 'projects/core-vpc/global/networks/shared',
    bgp: { asn: 64514 },
  },
  sourceSubnetworkIpRangesToNat: 'LIST_OF_SUBNETWORKS',
  subnetworks: [
    {
      name: subnet.getSubnetwork().selfLink,
      sourceIpRangesToNats: ['ALL_IP_RANGES'],
    },
  ],
});
```

Example – Multiple subnetworks with different IP ranges:

```ts
const nat = new CloudInfraNat(meta, {
  router: {
    network: vpc.selfLink,
  },
  sourceSubnetworkIpRangesToNat: 'LIST_OF_SUBNETWORKS',
  subnetworks: [
    {
      name: privateSubnet.getSubnetwork().selfLink,
      sourceIpRangesToNats: ['ALL_IP_RANGES'],
    },
    {
      name: gkeSubnet.getSubnetwork().selfLink,
      sourceIpRangesToNats: ['PRIMARY_IP_RANGE', 'LIST_OF_SECONDARY_IP_RANGES'],
      secondaryIpRangeNames: ['pods', 'services'],
    },
  ],
});
```

Example – Static NAT IPs:

```ts
const nat = new CloudInfraNat(meta, {
  router: {
    network: vpc.selfLink,
  },
  natIpAllocateOption: 'MANUAL_ONLY',
  natIps: [staticIP.selfLink],
  sourceSubnetworkIpRangesToNat: 'LIST_OF_SUBNETWORKS',
  subnetworks: [
    {
      name: subnet.getSubnetwork().selfLink,
      sourceIpRangesToNats: ['ALL_IP_RANGES'],
    },
  ],
});
```

---

## Runtime API

Each component exposes getter methods that return the underlying Pulumi
resources (or concrete outputs) and an `exportOutputs` method that writes to
`CloudInfraOutput`.

```ts
subnet.getSubnetwork(); // gcp.compute.Subnetwork
connector.getConnector(); // gcp.vpcaccess.Connector
psa.getGlobalAddress(); // gcp.compute.GlobalAddress
psa.getConnection(); // gcp.servicenetworking.Connection
nat.getRouter(); // gcp.compute.Router
nat.getRouterNat(); // gcp.compute.RouterNat
nat.getName(); // pulumi.Output<string> - NAT name
nat.getRegion(); // pulumi.Output<string> - NAT region
nat.getRouterName(); // pulumi.Output<string> - Router name
```

### NAT Cross-Stack Integration

The NAT component integrates seamlessly with other cloud-infra components:

```ts
// Export NAT outputs for other stacks
nat.exportOutputs(outputManager);

// Use NAT with subnet references
const nat = new CloudInfraNat(meta, {
  router: {
    network: vpc.selfLink,
  },
  sourceSubnetworkIpRangesToNat: 'LIST_OF_SUBNETWORKS',
  subnetworks: [
    {
      name: subnet.getSubnetwork().selfLink, // Reference to CloudInfraSubnet
      sourceIpRangesToNats: ['ALL_IP_RANGES'],
    },
  ],
});

// Access underlying resources
const router = nat.getRouter();
const routerNat = nat.getRouterNat();
```

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraCloudRunService`](../../components/cloudrunservice/README.md) – Services that use VPC connectors
- [`CloudInfraCloudRunJob`](../../components/cloudrunjob/README.md) – Jobs that use VPC connectors
- [`CloudInfraDatabaseInstance`](../../components/database/README.md) – Databases that use Private Service Access
- [`CloudInfraBucket`](../../components/bucket/README.md) – Storage buckets for static content

### Organization Modules

- [`CloudInfraHostProject`](../project/README.md) – Host projects that provide shared VPC
- [`CloudInfraServiceProject`](../project/README.md) – Service projects that attach to shared VPC
- [`CloudInfraFolder`](../folder/README.md) – Folder organization for network resources

---

## See Also

- [GCP VPC Documentation](https://cloud.google.com/vpc/docs)
- [Serverless VPC Access](https://cloud.google.com/vpc/docs/serverless-vpc-access)
- [Private Service Access](https://cloud.google.com/vpc/docs/private-services-access)
- [Cloud NAT](https://cloud.google.com/nat/docs)
- [Project Management](../project/README.md)
- [Folder Management](../folder/README.md)
