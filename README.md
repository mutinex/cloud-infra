<p align="center">
  <img src="./logo.png" width="400" />
</p>

# @mutinex/cloud-infra

`@mutinex/cloud-infra` is a comprehensive Pulumi library designed to streamline the management of Google Cloud Platform (GCP) infrastructure. It provides a suite of foundational helpers and resource components that enforce consistency, simplify complex tasks like IAM and cross-stack dependencies, and promote best practices for building scalable and maintainable cloud environments.

By standardizing resource naming, metadata, outputs, and access policies, this library helps accelerate development and reduce configuration errors across all your organization's projects.

The library is designed with an "infrastructure as software" philosophy, favoring strongly-typed, reusable components over raw resource definitions. This approach not only improves developer experience by providing clear APIs and reducing boilerplate, but also enhances security and compliance by embedding organizational policies directly into the building blocks of the infrastructure. The result is a more robust, predictable, and secure cloud foundation.

## Core Components

The core of the library consists of foundational helpers that provide the building blocks for all other components.

- **[Core: Meta](./src/core/meta/README.md)**: Manages standardized resource naming, regionality, and metadata.
- **[Core: Output](./src/core/output/README.md)**: Provides structured recording and organization of Pulumi resource outputs for cross-stack consumption.
- **[Core: Reference](./src/core/reference/README.md)**: Simplifies consuming outputs from other Pulumi stacks with type-safe accessors and resource aliasing. Now includes domain-optional resolution (`ReferenceWithoutDomain`) for direct stack access without domain scoping, enabling simplified principal configuration in access matrices.
- **[Core: Access Matrix](./src/core/access-matrix/README.md)**: Offers a declarative, case-based system for managing complex GCP IAM policies.

## Resource Components

Reusable, opinionated components that wrap one or more GCP resources and apply your organization's conventions.

| Category     | Component                                                       | Description                                                                              |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| IAM          | [Account](./src/components/account/README.md)                   | Create GCP service-accounts (single & bulk).                                             |
| IAM          | [Role](./src/components/role/README.md)                         | Project-/org-level custom IAM roles with smart permission validation.                    |
| IAM          | [Workload Identity Pool](./src/components/wip/README.md)        | Workload Identity Pools and OIDC Providers for external identities.                      |
| IAM          | [Entitlement](./src/organization/pam/README.md)                 | Privileged Access Manager entitlement with smart defaults.                               |
| Data         | [Bucket](./src/components/bucket/README.md)                     | Regional, multi-regional & dual-regional Cloud Storage buckets (single & bulk).          |
| Data         | [Database](./src/components/database/README.md)                 | Cloud SQL instance, database and users                                                   |
| Data         | [Secret](./src/components/secret/README.md)                     | Secret Manager secret + version (regional or global).                                    |
| Data         | [Repository](./src/components/repository/README.md)             | Artifact Registry repository with naming/location helpers.                               |
| Compute      | [Cloud Run Service](./src/components/cloudrunservice/README.md) | Cloud Run service plus regional NEG.                                                     |
| Compute      | [Cloud Run Job](./src/components/cloudrunjob/README.md)         | One-off/background Cloud Run jobs.                                                       |
| Compute      | [Compute Instance](./src/components/instance/README.md)         | Compute Engine instance with zonal naming and meta integration.                          |
| Network      | [Application Load Balancer](./src/components/alb/README.md)     | HTTP(S) Application Load Balancer (global or regional).                                  |
| Network      | [Backend Service](./src/components/backendservice/README.md)    | (Regional / global) backend service for load-balancers.                                  |
| Organization | [NAT Gateway](./src/organization/network/README.md)             | NAT Gateway with Router and RouterNat for outbound internet access from private subnets. |
| Organization | [Project](./src/organization/project/README.md)                 | Host & service projects with Shared VPC and API bootstrapping.                           |
| Organization | [Network](./src/organization/network/README.md)                 | VPC subnet, Serverless VPC Connector & Private Service Connect helpers.                  |

_(More Components are Coming)_

**Note on Forwarding Rule Targets:**  
`GlobalForwardingRule.target` and `ForwardingRule.target` must use the full in-project URL (selfLink) of the `TargetHttpsProxy` resource, not just its ID.

## Notes: Getter & Export Patterns

To address Pulumi’s unhandled promise-leak diagnostics, getters and output exports now unwrap `pulumi.Output<T>` values using `.apply` before returning or recording them:

### Getter Methods

All public getters wrap raw Outputs to hide the thenable interface. For example:

```typescript
public getName(): pulumi.Output<string> {
  return this.service.name.apply((n: string) => n);
}
```

Always use these getters instead of exposing raw `Output` properties directly.

### Exporting Outputs

The `exportOutputs` method defers recording until all Outputs resolve via `pulumi.all([...]).apply(...)`. For example:

```typescript
public exportOutputs(manager: CloudInfraOutput): void {
  pulumi
    .all([this.service.id, this.service.name, this.service.uri])
    .apply(() => {
      manager.record(
        "gcp:cloudrunv2:Service",
        grouping,
        this.meta,
        this.service as ServiceWithExtras,
      );
    });
}
```

This pattern suppresses thenable-leak warnings and ensures Pulumi tracks dependencies correctly.
