# Secret Manager (`CloudInfraSecretVersion`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers with CloudInfra naming.
>
> Creates a Secret **and** its first Version in one go. Chooses between:
>
> • `gcp.secretmanager.Secret` (global, user-managed replication) when
> `meta.getMultiRegion()` returns multiple regions (dual/multi region).  
> • `gcp.secretmanager.RegionalSecret` when a single region is required.
>
> All arguments accepted by Pulumi's Version resources remain available. The
> underlying Secret can be customised through the `secret` extras block.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraSecretVersion,
} from '@mutinex/cloud-infra';
```

Constructor – `new CloudInfraSecretVersion(meta, config?)`

---

## Real-World Examples

The following examples are based on actual production secret management:

### 1. Database Password Secret (Dual-Region)

```ts
import * as pulumi from '@pulumi/pulumi';
import {
  CloudInfraMeta,
  CloudInfraSecretVersion,
} from '@mutinex/cloud-infra';
import { gcpProjectId, sqlConfig } from './config';

// Master instance password secret for SQL database
const masterInstancePasswordMeta = new CloudInfraMeta({
  name: 'api-sql-master-pwd',
  domain: 'au',
  location: ['australia-southeast1', 'us-central1'],
});

export const masterInstancePassword = new CloudInfraSecretVersion(
  masterInstancePasswordMeta,
  {
    project: gcpProjectId,
    secretData: sqlConfig.password,
  }
);
```

### 2. Database Connection String Secret

```ts
// Database URI secret with interpolated connection string
const apiDbUriMeta = new CloudInfraMeta({
  name: 'api-sql-master-conn',
  domain: 'au',
  location: ['australia-southeast1', 'us-central1'],
});

export const apiDbUri = new CloudInfraSecretVersion(apiDbUriMeta, {
  project: gcpProjectId,
  secretData: pulumi.interpolate`postgres://${apiDbUser.getName()}:${apiDbUserPassword.result}@${masterSqlInstance.getInstance().privateIpAddress}/${apiDb.getDatabase().name}`,
});
```

### 3. Conditional Secret Creation

```ts
// Secret created only in specific environments
export const masterInstancePassword = templateConfig.isStatic
  ? (() => {
      const masterInstancePasswordMeta = new CloudInfraMeta({
        name: 'api-sql-master-pwd',
        domain: 'au',
        location: ['australia-southeast1', 'us-central1'],
      });

      return new CloudInfraSecretVersion(masterInstancePasswordMeta, {
        project: gcpProjectId,
        secretData: sqlConfig.password,
      });
    })()
  : undefined;
```

### Key Production Patterns

1. **Dual-Region Replication**
   - Secrets replicated across primary and backup regions
   - Ensures high availability for critical credentials
   - Uses user-managed replication for control

2. **Database Integration**
   - Password secrets for database authentication
   - Connection string secrets with interpolated values
   - Integration with CloudInfraDatabaseInstance and related components

3. **Conditional Deployment**
   - Secrets created only in specific environments (static vs dynamic)
   - Environment-specific configuration patterns
   - Proper resource lifecycle management

4. **Project-Scoped Secrets**
   - All secrets created within specific projects
   - Consistent naming with domain and location conventions
   - Integration with broader infrastructure patterns

---

## Additional Examples

### 1. Regional secret

```ts
const meta = new CloudInfraMeta({ name: 'db-root-pwd', domain: 'au' });

new CloudInfraSecretVersion(meta, {
  secretData: pulumi.secret('p@ssw0rd'),
});
```

### 2. Dual-region secret with labels

```ts
const meta = new CloudInfraMeta({
  name: 'jwt-secret',
  domain: 'us',
  location: ['us-central1', 'us-east1'],
});

new CloudInfraSecretVersion(meta, {
  secretData: 'super-secret-jwt-key',
  secret: { labels: { owner: 'my-team', env: 'dev' } },
});
```

### 3. Multi-regional secret with automatic replication

```ts
new CloudInfraSecretVersion(meta, {
  secretData: 'top-secret',
  secret: {
    replication: { automatic: true }, // fully automatic replication
  },
});
```

---

## Extras

`config.secret` – any fields accepted by `SecretArgs` / `RegionalSecretArgs` to
customise the Secret resource (labels, rotation, replication, etc.).

All other fields go to the Version resource.

---

## Runtime API

| Getter                   | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `getSecret()`            | Returns the Secret / RegionalSecret resource.   |
| `getVersion()`           | Returns the Version resource.                   |
| `getId()`                | ID of the Version (useful for IAM).             |
| `getName()`              | Secret name.                                    |
| `exportOutputs(manager)` | Records secret + version in `CloudInfraOutput`. |

---

## Behaviour notes

1. Unless you provide `secret.replication`, the component builds a **user-managed** replication set from `meta.getMultiRegion()`.
2. Secret payload (`secretData`, `secretDataSecret`) is always treated as a Pulumi secret.
3. Resource names follow CloudInfra naming conventions.

---

## Related Components

### Core Components

- [`CloudInfraMeta`](../../core/meta/README.md) – Metadata and naming conventions
- [`CloudInfraOutput`](../../core/output/README.md) – Cross-stack resource sharing
- [`CloudInfraReference`](../../core/reference/README.md) – Resource referencing

### Component Integration

- [`CloudInfraDatabaseInstance`](../database/README.md) – Database instances that use secrets for passwords
- [`CloudInfraDatabaseUser`](../database/README.md) – Database users with secret passwords
- [`CloudInfraCloudRunService`](../cloudrunservice/README.md) – Services that consume secrets
- [`CloudInfraCloudRunJob`](../cloudrunjob/README.md) – Jobs that consume secrets
- [`CloudInfraBucket`](../bucket/README.md) – Storage buckets with metadata referencing secrets

### Organization Modules

- [`CloudInfraServiceProject`](../../organization/project/README.md) – Projects where secrets are created
- [`CloudInfraFolder`](../../organization/folder/README.md) – Folder organization for secret resources

---

## See Also

- [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [Database Integration](../database/README.md)
- [Cloud Run Integration](../cloudrunservice/README.md)
- [Project Management](../../organization/project/README.md)
