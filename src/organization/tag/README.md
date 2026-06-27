# CloudInfraTag

A high-level wrapper around `gcp.tags.TagKey` and `gcp.tags.TagValue` that creates tag keys with multiple values following CloudInfra conventions.

## Features

- **Name / ID generation** – the tag key `shortName` is derived from the attached [`CloudInfraMeta`](../../core/meta/README.md) (`meta.getName()`, see naming rules).
- **Parent defaulting** – `parent` defaults to the organization root when not specified.
- **Multi-value support** – Creates a tag key with multiple predefined values in a single component.
- **Automatic value creation** – Tag values are automatically created for each specified value.
- **Validation** – Ensures proper configuration with Zod schema validation.
- **Output registration** – Automatically recorded via [`CloudInfraOutput`](../../core/output/README.md) for cross-stack consumption.

---

## Construction

`CloudInfraTag` is **meta-first only** – it accepts a [`CloudInfraMeta`](../../core/meta/README.md) instance, a (required) config object containing the `values` array, and optional Pulumi `ComponentResourceOptions`. There is no name-first (`new CloudInfraTag('environment', …)`) overload; the `naming` option (`'conventional' | 'no-location' | 'no-prefix' | 'literal' | { preview }`) is supplied on the `CloudInfraMeta`.

## Quick Example

```ts
import { CloudInfraMeta, CloudInfraTag } from '@mutinex/cloud-infra';

const environmentTagMeta = new CloudInfraMeta({
  name: 'environment',
  omitDomain: true,
});

const environmentTag = new CloudInfraTag(environmentTagMeta, {
  description: 'Environment classification',
  values: [
    {
      shortName: 'dev',
      description: 'Development Environment',
    },
    {
      shortName: 'prod',
      description: 'Production Environment',
    },
  ],
});
```

---

## Real-World Examples

The following example is based on actual production tag management:

### Environment Tag for Organization Governance

```ts
import { CloudInfraMeta, CloudInfraTag } from '@mutinex/cloud-infra';

// Environment Tag for governance and billing
const environmentTagsMeta = new CloudInfraMeta({
  name: 'env',
  omitPrefix: true,
  omitDomain: true,
});

export const environmentTags = new CloudInfraTag(environmentTagsMeta, {
  description: 'Mutinex Environment',
  values: [
    {
      shortName: 'dev',
      description: 'Development Environment',
    },
    {
      shortName: 'prd',
      description: 'Production Environment',
    },
    {
      shortName: 'stg',
      description: 'Staging Environment',
    },
    {
      shortName: 'uat',
      description: 'User Acceptance Testing Environment',
    },
  ],
});
```

### Usage with Other Components

```ts
import {
  CloudInfraMeta,
  CloudInfraFolder,
  CloudInfraServiceProject,
} from '@mutinex/cloud-infra';

// Apply environment tag to a folder
const folderMeta = new CloudInfraMeta({
  name: 'production',
  omitDomain: true,
});

const productionFolder = new CloudInfraFolder(folderMeta, {
  // Reference the tag value by its resource ID (e.g. resolved from outputs)
  cloudInfraTags: ['tagValues/1234567890'],
});

// Apply environment tag to a project (service projects are name-first)
const devProject = new CloudInfraServiceProject('analytics-dev', {
  cloudInfraTags: ['tagValues/0987654321'],
  vpcHostProject: hostProject.getProjectId(),
});
```

### Key Production Patterns

1. **Standardized Environment Classification**
   - Consistent environment naming across all resources
   - Clear descriptions for each environment type
   - Supports governance and billing separation

2. **Organization-Level Tag Management**
   - Tags created at organization level for global visibility
   - Centralized tag value management
   - Consistent application across all resources

3. **Integration with Resource Management**
   - Tags applied to folders for hierarchical governance
   - Tags applied to projects for billing and access control
   - Supports automated policy enforcement

---

## Configuration

### Core Properties

| Field         | Type         | Default           | Description                      |
| ------------- | ------------ | ----------------- | -------------------------------- |
| `parent`      | `string`     | Organization root | Parent organization or folder ID |
| `description` | `string`     | —                 | Description of the tag key       |
| `values`      | `TagValue[]` | **required**      | Array of tag values to create    |

### Tag Value Configuration

Each value in the `values` array must include:

| Field         | Type     | Description                  |
| ------------- | -------- | ---------------------------- |
| `shortName`   | `string` | Short name for the tag value |
| `description` | `string` | Description of the tag value |

### Example Configuration

```ts
const config: CloudInfraTagConfig = {
  description: 'Cost center classification',
  values: [
    {
      shortName: 'engineering',
      description: 'Engineering Department',
    },
    {
      shortName: 'marketing',
      description: 'Marketing Department',
    },
    {
      shortName: 'operations',
      description: 'Operations Department',
    },
  ],
};
```

---

## Outputs

The component exposes `exportOutputs(manager)` to record the tag key (`gcp:tags:TagKey`) and each tag value (`gcp:tags:TagValue`) with a [`CloudInfraOutput`](../../core/output/README.md) for cross-stack consumption:

```ts
import { CloudInfraOutput } from '@mutinex/cloud-infra';

const out = new CloudInfraOutput();
environmentTags.exportOutputs(out);

export const cloudInfra = out.getFlatOutputs(); // v2 flat wire (recommended)
export const org = out.getOutputs(); // legacy nested wire
```

### Runtime API

| Method                   | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| `exportOutputs(manager)` | Records the tag key and values with a `CloudInfraOutput` manager |

---

## Tag Value References

To use tag values created by `CloudInfraTag`, reference them by their resource ID. The component records both the tag key and each tag value via `exportOutputs`, so downstream stacks can resolve the `tagValues/{id}` path from the exported outputs (or supply a known ID directly):

```ts
// Tag values are recorded as gcp:tags:TagValue, grouped by their shortName.
// Reference them in other components that accept cloudInfraTags:

const folderMeta = new CloudInfraMeta({ name: 'production', omitDomain: true });
const folder = new CloudInfraFolder(folderMeta, {
  cloudInfraTags: [
    // Full resource path of the tag value
    'tagValues/1234567890',
  ],
});
```

---

## Validation and Constraints

### Single Name Requirement

The component expects a single string name, not an array:

```ts
// ✅ Correct
const meta = new CloudInfraMeta({ name: 'environment' });

// ❌ Will throw ValidationError
const meta = new CloudInfraMeta({ name: ['env', 'stage'] });
```

### Required Values

The `values` array is required and must contain at least one value:

```ts
// ✅ Correct
const tag = new CloudInfraTag(new CloudInfraMeta({ name: 'environment' }), {
  description: 'Environment tag',
  values: [{ shortName: 'dev', description: 'Development' }],
});

// ❌ Will throw ValidationError
const tag = new CloudInfraTag(new CloudInfraMeta({ name: 'environment' }), {
  description: 'Environment tag',
  values: [], // Empty array not allowed
});
```

---

## Error Handling

The component provides detailed error messages for common issues:

- **ValidationError**: Invalid configuration (empty values, wrong name type)
- **ResourceError**: GCP resource creation failures

```ts
try {
  const tag = new CloudInfraTag(new CloudInfraMeta({ name: 'environment' }), config);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Configuration error:', error.message);
  } else if (error instanceof ResourceError) {
    console.error('GCP resource error:', error.message);
  }
}
```

---

## Related Components

- [`CloudInfraFolder`](../folder/README.md) – Folders that can be tagged
- [`CloudInfraServiceProject`](../project/README.md) – Projects that can be tagged
- [`CloudInfraHostProject`](../project/README.md) – Host projects that can be tagged
- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing

---

## See Also

- [GCP Tags Documentation](https://cloud.google.com/resource-manager/docs/tags/tags-overview)
- [GCP Tag Keys and Values](https://cloud.google.com/resource-manager/docs/tags/tags-creating-and-managing)
- [GCP Resource Hierarchy](https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy)
- [GCP IAM Conditions with Tags](https://cloud.google.com/iam/docs/conditions-overview)
