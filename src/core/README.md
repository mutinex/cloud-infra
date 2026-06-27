# Core Infrastructure Modules

The `cloud-infra/core` directory contains the foundational modules that power the cloud infrastructure library. These modules provide centralized logging, error handling, validation, configuration management, and specialized components for building robust cloud infrastructure.

## 📋 Available Modules

### 🔧 **Foundational Systems**

- **[config.ts](../config.ts)** - Centralized configuration constants
- **[logging.ts](./logging.ts)** - Structured logging with component context
- **[errors.ts](./errors.ts)** - Enhanced error hierarchy with context
- **[helpers.ts](./helpers.ts)** - Essential utility functions
- **[component/naming.ts](./component/naming.ts)** - Name-first construction (`NamingArgs` / `NamingMode`)

### 🧩 **Core Components**

- **[meta/](./meta/)** - Location and region management
- **[output/](./output/)** - Cross-stack output management
- **[reference/](./reference/)** - Cross-stack reference system
- **[access-matrix/](./access-matrix/)** - IAM permission management

### 🛠️ **Utilities**

- **[pulumi-type-detector.ts](./pulumi-type-detector.ts)** - Pulumi type detection
- **[types.ts](./types.ts)** - Core type definitions

## 🚀 Quick Start

### Configuration Setup

Organisation/GCP and reference values are read lazily from the stack's Pulumi
config under the `cloudInfra` namespace. Set them once per stack:

```bash
pulumi config set cloudInfra:organizationId   "123456789012"
pulumi config set cloudInfra:billingAccountId "ABCDEF-123456-789ABC"
pulumi config set cloudInfra:organizationName "my-org"
pulumi config set cloudInfra:defaultOutputKey "cloudInfra"
```

```typescript
import { gcpConfig } from '@mutinex/cloud-infra';

// Lazy getters backed by the live Pulumi config.
const orgId = gcpConfig.organizationId;
```

Library tuning constants (access-matrix limits, naming lengths) are fixed,
exported `as const` objects — there is no runtime reconfiguration:

```typescript
import { accessMatrixConfig, resourceNamingConfig } from '@mutinex/cloud-infra';

accessMatrixConfig.maxResourceNameLength; // 100 (frozen)
resourceNamingConfig.certificateMaxLength; // 32
```

### Logging Usage

Replace all `pulumi.log.*` calls with structured logging:

```typescript
import { CloudInfraLogger } from '@mutinex/cloud-infra/core/logging';

// OLD: pulumi.log.warn('Component: message', undefined, undefined, true);
// NEW:
CloudInfraLogger.warn('Processing failed', {
  component: 'my-component',
  operation: 'processData',
});
```

### Error Handling

Use typed errors with component context:

```typescript
import {
  ValidationError,
  ResourceError,
} from '@mutinex/cloud-infra/core/errors';

// For validation failures
throw new ValidationError(
  'Invalid input provided',
  'my-component',
  'validateInput'
);

// For resource failures
throw new ResourceError('Failed to create bucket', 'storage', 'createBucket');
```

### Name-First Component Construction

v2 components are constructed name-first via the `resolveMeta` /
`NamingArgs` / `NamingMode` surface in `component/naming.ts`:

```typescript
import { CloudInfraAccount } from '@mutinex/cloud-infra';

// new CloudInfraX("name", { domain, location, prefix, naming, ...config })
const sa = new CloudInfraAccount('my-app', {
  domain: 'au',
  naming: 'conventional', // 'conventional' | 'no-location' | 'no-prefix' | 'literal' | { preview }
});
```

See the [Meta README](./meta/README.md) for the full `NamingMode` formula table.

## 📚 Detailed Module Documentation

## 🔧 Logging System (`logging.ts`)

The `CloudInfraLogger` provides structured logging with component context, replacing all `pulumi.log.*` calls throughout the library.

### Features

- **Structured Context**: Each log includes component and operation context
- **Log Levels**: Support for `debug`, `info`, `warn`, and `error` levels
- **Consistent Format**: `[component][operation] message` format
- **Pulumi Integration**: Integrates with Pulumi's logging system

### Usage Patterns

```typescript
import { CloudInfraLogger } from './logging';

// Basic logging
CloudInfraLogger.info('Component initialized', {
  component: 'bucket',
  operation: 'constructor',
});

// Error logging with details
CloudInfraLogger.error('Resource creation failed', {
  component: 'storage',
  operation: 'createBucket',
});

// Warning without operation context
CloudInfraLogger.warn('Deprecated feature used', {
  component: 'access-matrix',
});

// Debug logging (only in verbose mode)
CloudInfraLogger.debug('Processing rule', {
  component: 'access-matrix',
  operation: 'processRule',
});
```

## ⚠️ Error Handling System (`errors.ts`)

Enhanced error hierarchy that extends standard JavaScript errors with component context and backward compatibility.

### Available Error Types

```typescript
import {
  CloudInfraError, // Base (abstract) error class
  ValidationError, // Input validation failures
  ResourceError, // Infrastructure/resource failures
  ConfigurationError, // Configuration issues
} from './errors';
```

### Usage Patterns

```typescript
// Backward compatible (still works)
throw new ValidationError('Invalid input');

// Enhanced with context (recommended)
throw new ValidationError(
  'Component expects a single name',
  'my-component', // component name
  'constructor' // operation name
);

// Resource errors
throw new ResourceError(
  'Failed to create GCP resource',
  'bucket',
  'createResource',
  originalError // optional cause
);

// Configuration errors
throw new ConfigurationError(
  'Missing required configuration',
  'config',
  'validate'
);
```

### Error Properties

All errors include:

- `message`: Error description
- `component`: Component that threw the error (optional, defaults to 'unknown')
- `operation`: Operation during which error occurred (optional)
- `cause`: Original error that caused this error (optional)

## 🔧 Reference System Configuration

The reference system allows you to consume outputs from other Pulumi stacks with a simplified, type-safe API.

### Configuring Resource Type Aliases

The reference system supports short aliases for common GCP resources. You can extend these by modifying the configuration:

```typescript
// In src/core/reference/config.ts

// Add new aliases
export const myResourceAliases = ['myres', 'resource'] as const;

// Add to the resource type map
export const resourceTypeMap: Record<string, string> = {
  // ... existing mappings
  ...mapFrom(myResourceAliases, 'gcp:myservice:MyResource'),
};
```

### Current Supported Aliases

| Alias                             | GCP Resource Type                         |
| --------------------------------- | ----------------------------------------- |
| `serviceaccount`, `sa`, `account` | `gcp:serviceaccount:Account`              |
| `gcs`, `bucket`                   | `gcp:storage:Bucket`                      |
| `role`                            | `gcp:projects:IAMCustomRole`              |
| `orgrole`                         | `gcp:organizations:IAMCustomRole`         |
| `network`                         | `gcp:compute:Network`                     |
| `subnet`                          | `gcp:compute:Subnetwork`                  |
| `connector`                       | `gcp:vpcaccess:Connector`                 |
| `project`                         | `gcp:organizations:Project`               |
| `tag`                             | `gcp:tags:TagValue`                       |
| `folder`                          | `gcp:organizations:Folder`                |
| `entitlement`, `pam`              | `gcp:privilegedaccessmanager:Entitlement` |
| `secret`                          | `gcp:secretmanager:Secret`                |
| `secretversion`                   | `gcp:secretmanager:SecretVersion`         |
| `certmap`                         | `gcp:certificatemanager:CertificateMap`   |
| `cloudrun`                        | `gcp:cloudrunv2:Service`                  |

### Usage Example

Use the v2 `get()` API: resolve a resource by name and read a lazy field. Pass
`{ type }` only to disambiguate a name shared across types; omit it for a
cross-type scan. The legacy `getId()` / `getEmail()` getters are `@deprecated`.

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

// Name-first (positional) construction; `domain` is optional.
const ref = new CloudInfraReference('organization/base/prd', { domain: 'au' });

const networkId = ref.get('default', { type: 'network' }).id;
const bucketId = ref.get('data-bucket', { type: 'gcs' }).id;
const saEmail = ref.get('api-service', { type: 'sa' }).email;

// Reading the v2 flat-output wire (CloudInfraOutput.getFlatOutputs()):
const flatRef = new CloudInfraReference('organization/base/prd', {
  domain: 'au',
  flat: true,
});
const flatSaEmail = flatRef.get('api-service').email;
```

See the [Reference README](./reference/README.md) for the full `get()` surface,
the flat-wire reader, and the deprecation table.

## 🛡️ Adding a New Access-Matrix Resource Type

The access-matrix system is extensible. Adding support for a new GCP resource
type touches three places: the IAM-binding dispatcher, the type-discovery
registry, and the supported-type lists.

> **Architecture note**: the former `IamBuilderRegistry` dispatch table and the
> per-type `builders/*-builder.ts` classes were collapsed in v2. IAM bindings
> are now created by a single `createIamBinding` switch in
> `src/core/access-matrix/builders/iam-binding.ts`. `ResourceRegistry` still
> exists, but only maps a Pulumi type token to a lightweight `ResourceHandler`
> whose sole live member is `supportedType` (used for type discovery / naming).

### Step 1: Add an IAM-binding case

In `src/core/access-matrix/builders/iam-binding.ts`, add a `build*IamBinding`
helper and wire it into the `createIamBinding` switch:

```typescript
// in iam-binding.ts
function buildMyResourceIamBinding(
  params: IamBindingParams
): pulumi.CustomResource {
  const { resource, role, member, resourceName } = params;
  // ...extract the id/location from `resource` (component getter, direct
  //    Pulumi resource, or fallback property)...
  return new gcp.myservice.MyResourceIamMember(resourceName, {
    myResource: /* extracted id */,
    role,
    member,
  });
}

export function createIamBinding(
  resourceType: string,
  params: IamBindingParams
): pulumi.CustomResource {
  switch (resourceType) {
    // ...existing cases...
    case 'gcp:myservice/myResource:MyResource':
      return buildMyResourceIamBinding(params);
    // ...
  }
}
```

Also add the new type token to the `SUPPORTED_RESOURCE_TYPES` array in the same
file (it backs the "Available types: ..." diagnostic).

### Step 2: Add a ResourceHandler and register it

Add the handler interface/impl (`resources/resource-types.ts` and
`resources/resource-handlers.ts`) — the handler only needs to declare its
`supportedType`:

```typescript
// resource-types.ts
export interface MyResourceResourceHandler extends ResourceHandler {
  readonly supportedType: 'gcp:myservice/myResource:MyResource';
}

// resource-handlers.ts
export class MyResourceResourceHandlerImpl
  implements MyResourceResourceHandler
{
  readonly supportedType = 'gcp:myservice/myResource:MyResource' as const;
}
```

Register it in `src/core/access-matrix/registry-initializer.ts`:

```typescript
ResourceRegistry.register(
  'gcp:myservice/myResource:MyResource',
  MyResourceResourceHandlerImpl
);
```

### Step 3: Add the type token to the supported-type lists

Add the new token to `SUPPORTED_RESOURCE_TYPES` in
`resources/resource-types.ts` (and a `get*` getter to
`RESOURCE_DISCOVERY_GETTERS` if the resource is wrapped by a CloudInfra
component that exposes one).

### Step 4: Test Your Handler

Create tests following the pattern in `src/core/access-matrix/__tests__/`:

```typescript
import { CloudInfraAccessMatrix } from '../index';
import * as gcp from '@pulumi/gcp';

describe('MyResource Access Matrix', () => {
  test('should create IAM binding for my resource', () => {
    const resource = new gcp.myservice.MyResource('test-resource');

    const matrix = new CloudInfraAccessMatrix({
      'my-resource-test': [
        {
          resource: resource,
          role: 'roles/myservice.user',
          principals: ['user:test@example.com'],
        },
      ],
    });

    // Add assertions
  });
});
```

### Supported Resource Types (Current)

The access-matrix currently supports these GCP resource types:

- **Projects**: `gcp:organizations/project:Project`
- **Folders**: `gcp:organizations/folder:Folder`
- **Service Accounts**: `gcp:serviceaccount/account:Account`
- **Storage Buckets**: `gcp:storage/bucket:Bucket`
- **Cloud Run Services & Jobs**: `gcp:cloudrunv2/service:Service`, `gcp:cloudrunv2/job:Job`
- **Secrets**: `gcp:secretmanager/secret:Secret`, `gcp:secretmanager/regionalSecret:RegionalSecret`
- **Subnetworks**: `gcp:compute/subnetwork:Subnetwork`
- **Compute Instances**: `gcp:compute/instance:Instance`
- **Artifact Registry Repositories**: `gcp:artifactregistry/repository:Repository`

## 🏗️ Architecture Principles

### Configuration Model

- **Org/GCP/reference values** (`gcpConfig`, `referenceConfig`) are read lazily
  from the stack's Pulumi config under the `cloudInfra` namespace.
- **Tuning constants** (`accessMatrixConfig`, `resourceNamingConfig`) are fixed,
  exported `as const` objects — compile-time constants, not runtime-tunable.

### Error Handling Strategy

- **Backward Compatibility**: All error constructors accept optional context
- **Context Propagation**: Component and operation context flows through all errors
- **Typed Errors**: Specific error types for different failure categories
- **Cause Chaining**: Original errors preserved through `cause` property

## 🔍 Migration Guide

### From Scattered Configuration

**Before:**

```typescript
const MAX_RETRY = 3;
const TIMEOUT = 30000;
const ENABLE_LOGGING = true;
```

**After:**

```typescript
import { accessMatrixConfig } from '@mutinex/cloud-infra';

const timeout = accessMatrixConfig.defaultOperationTimeout;
const enableLogging = accessMatrixConfig.enableDetailedLogging;
```

### From pulumi.log.\*

**Before:**

```typescript
pulumi.log.warn('Component: message', undefined, undefined, true);
```

**After:**

```typescript
import { CloudInfraLogger } from './core/logging';

CloudInfraLogger.warn('message', {
  component: 'component-name',
  operation: 'operationName',
});
```

### From Raw Errors

**Before:**

```typescript
throw new Error('Component expects a single name');
```

**After:**

```typescript
import { ValidationError } from './core/errors';

throw new ValidationError(
  'Component expects a single name',
  'component-name',
  'constructor'
);
```

## 📋 Component Alignment Checklist

When integrating with core systems, ensure:

- [ ] **Configuration**: Use the exported config objects (`gcpConfig`, `accessMatrixConfig`, `resourceNamingConfig`) instead of hard-coded values
- [ ] **Logging**: Replace `pulumi.log.*` with `CloudInfraLogger`
- [ ] **Errors**: Use typed errors with component context
- [ ] **Validation**: Validate inputs through the Zod meta schema (`CloudInfraMetaSchema`) rather than ad-hoc checks
- [ ] **Utilities**: Import from `./core/helpers` instead of duplicating
- [ ] **Testing**: Verify all builds pass after integration

## 🎯 Best Practices

### 1. **Consistent Context**

Always provide component and operation context:

```typescript
CloudInfraLogger.info('Operation completed', {
  component: 'bucket',
  operation: 'createBucket',
});
```

### 2. **Meaningful Names**

Use descriptive operation names:

```typescript
// Good
{ component: 'access-matrix', operation: 'processRule' }

// Avoid
{ component: 'access-matrix', operation: 'process' }
```

### 3. **Error Chaining**

Preserve original error context:

```typescript
try {
  // ... operation
} catch (originalError) {
  throw new ResourceError(
    'Failed to create resource',
    'component',
    'operation',
    originalError // Preserve original error
  );
}
```

### 4. **Type Safety**

Validate inputs through the Zod meta schema, which throws a `ZodError`
(surfaced as a `ValidationError`) on malformed input:

```typescript
import { CloudInfraMeta } from '@mutinex/cloud-infra';

// Construction parses input against CloudInfraMetaSchema; invalid names,
// locations, or over-length prefixes throw at construction time.
const meta = new CloudInfraMeta({ name: 'api', domain: 'au' });
```

## 📖 Additional Resources

- **[Access Matrix README](./access-matrix/README.md)** - Detailed IAM management documentation
- **[Reference README](./reference/README.md)** - Cross-stack reference system documentation
- **[Meta README](./meta/README.md)** - Location and region management
- **[Output README](./output/README.md)** - Cross-stack output management

---

The core modules provide the foundation for building robust, maintainable cloud infrastructure. They enforce consistency, provide type safety, and enable powerful features like cross-stack references and declarative IAM management.
