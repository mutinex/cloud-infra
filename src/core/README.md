# Core Infrastructure Modules

The `cloud-infra/core` directory contains the foundational modules that power the cloud infrastructure library. These modules provide centralized logging, error handling, validation, configuration management, and specialized components for building robust cloud infrastructure.

## 📋 Available Modules

### 🔧 **Foundational Systems**

- **[config.ts](../config.ts)** - Centralized configuration management
- **[logging.ts](./logging.ts)** - Structured logging with component context
- **[errors.ts](./errors.ts)** - Enhanced error hierarchy with context
- **[validation.ts](./validation.ts)** - Consolidated validation functions
- **[helpers.ts](./helpers.ts)** - Essential utility functions
- **[naming.ts](./naming.ts)** - Resource naming management

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

Initialize the library configuration at your application startup:

```typescript
import { Config } from '@mutinex/cloud-infra';

// Initialize once at app startup
Config.init({
  gcp: {
    organizationId: '123456789012',
    billingAccountId: 'ABCDEF-123456-789ABC',
    defaultProjectId: 'my-project',
  },
  accessMatrix: {
    enableDetailedLogging: true,
    maxResourceNameLength: 80,
  },
});

// Use anywhere in your application
const config = Config.get();
const orgId = config.gcp.organizationId;
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

### Validation

Use centralized validation functions:

```typescript
import {
  validateSingleName,
  validateRequiredString,
  isValidGcpProjectId,
} from '@mutinex/cloud-infra/core/validation';

// Validate single vs array inputs
const name = validateSingleName(input.name, 'MyComponent', 'MyBulkComponent');

// Validate required strings
const projectId = validateRequiredString(
  input.project,
  'project',
  'MyComponent'
);

// Validate GCP-specific formats
if (!isValidGcpProjectId(projectId)) {
  throw new ValidationError('Invalid project ID format');
}
```

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
  CloudInfraError, // Base error class
  ValidationError, // Input validation failures
  ResourceError, // Infrastructure/resource failures
  ConfigurationError, // Configuration issues
  ReferenceError, // Reference resolution failures
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

## ✅ Validation System (`validation.ts`)

Centralized validation functions that eliminate duplicate validation logic across components.

### Core Validation Functions

```typescript
import {
  validateSingleName,
  validateRequiredString,
  isValidEmail,
  isValidGcpResourceName,
  isValidGcpProjectId,
} from './validation';
```

### Function Reference

#### `validateSingleName(name, componentName, bulkAlternative?)`

Validates that input is a single string (not an array).

```typescript
// Throws if name is array or not string
const validName = validateSingleName(
  input.name,
  'CloudInfraBucket', // Component name for error
  'CloudInfraBulkBucket' // Alternative for arrays (optional)
);
```

#### `validateRequiredString(value, fieldName, componentName)`

Validates required string fields.

```typescript
const projectId = validateRequiredString(
  input.project,
  'project', // Field name for error
  'CloudInfraProject' // Component name for error
);
```

#### `isValidEmail(email)`, `isValidGcpResourceName(name)`, `isValidGcpProjectId(projectId)`

Boolean validation functions for specific formats.

```typescript
if (!isValidEmail(userEmail)) {
  throw new ValidationError('Invalid email format');
}

if (!isValidGcpProjectId(projectId)) {
  throw new ValidationError('Invalid GCP project ID');
}
```

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

### Usage Example

```typescript
import { CloudInfraReference } from '@mutinex/cloud-infra';

const ref = new CloudInfraReference({
  stack: 'organization/base/prd',
  domain: 'au',
});

// Use aliases for cleaner code
const networkId = ref.getId('network', 'default');
const bucketId = ref.getId('gcs', 'data-bucket');
const saEmail = ref.getEmail('sa', 'api-service');
```

## 🛡️ Creating New Access-Matrix Components

The access-matrix system is extensible. You can add support for new GCP resource types by implementing appropriate handlers.

### Step 1: Add Resource Handler

Create a new handler in `src/core/access-matrix/builders/`:

```typescript
// my-resource-builder.ts
import { ResourceHandler } from '../resources/resource-types';
import * as gcp from '@pulumi/gcp';

export const myResourceHandler: ResourceHandler<gcp.myservice.MyResource> = {
  getResourceName: resource => resource.name || 'unknown-my-resource',

  createIamBinding: (resource, role, members, bindingName) => {
    return new gcp.myservice.MyResourceIamBinding(bindingName, {
      myResource: resource.name,
      role: role,
      members: members,
    });
  },
};
```

### Step 2: Register the Handler

Add your handler to the registry in `src/core/access-matrix/builders/iam-builder-registry.ts`:

```typescript
import { myResourceHandler } from './my-resource-builder';

// Add to the registry
registry.registerHandler('gcp:myservice:MyResource', myResourceHandler);
```

### Step 3: Add Type Support

Add the resource type to the supported types in `src/core/access-matrix/resources/resource-types.ts`:

```typescript
export type SupportedResources =
  | gcp.organizations.Project
  | gcp.storage.Bucket
  | gcp.myservice.MyResource; // Add your type here
// ... other types
```

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
- **Artifact Registry Repositories**: `gcp:artifactregistry/repository:Repository`

## 🏗️ Architecture Principles

### Configuration Priority Chain

Configuration values are resolved in this order (highest to lowest priority):

1. **External Configuration** (via `Config.init()`)
2. **Pulumi Configuration** (stack config files)
3. **Environment Variables**
4. **Default Values**

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
const config = Config.get();
const maxRetry = config.component.maxRetries;
const timeout = config.component.timeout;
const enableLogging = config.component.enableLogging;
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

- [ ] **Configuration**: Use `Config.get()` instead of hard-coded values
- [ ] **Logging**: Replace `pulumi.log.*` with `CloudInfraLogger`
- [ ] **Errors**: Use typed errors with component context
- [ ] **Validation**: Use centralized validation functions
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

Use validation functions for type safety:

```typescript
const name = validateSingleName(input.name, 'ComponentName');
const required = validateRequiredString(input.field, 'field', 'ComponentName');
```

## 📖 Additional Resources

- **[Access Matrix README](./access-matrix/README.md)** - Detailed IAM management documentation
- **[Reference README](./reference/README.md)** - Cross-stack reference system documentation
- **[Meta README](./meta/README.md)** - Location and region management
- **[Output README](./output/README.md)** - Cross-stack output management

---

The core modules provide the foundation for building robust, maintainable cloud infrastructure. They enforce consistency, provide type safety, and enable powerful features like cross-stack references and declarative IAM management.
