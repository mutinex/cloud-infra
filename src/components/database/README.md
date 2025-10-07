# Cloud SQL Components (`CloudInfraDatabaseInstance`, `CloudInfraDatabase`, `CloudInfraDatabaseUser`)

> Part of **`@mutinex/cloud-infra`** – Pulumi helpers with CloudInfra naming
> conventions and sane defaults.
>
> These three components build on top of `@pulumi/gcp` Cloud SQL resources and
> reduce boilerplate:
>
> | Component                    | Wraps                      | Purpose                                                                   |
> | ---------------------------- | -------------------------- | ------------------------------------------------------------------------- |
> | `CloudInfraDatabaseInstance` | `gcp.sql.DatabaseInstance` | Provision a Cloud SQL instance with region derived from `CloudInfraMeta`. |
> | `CloudInfraDatabase`         | `gcp.sql.Database`         | Create a database **inside** an existing instance.                        |
> | `CloudInfraDatabaseUser`     | `gcp.sql.User`             | Create a user (password or IAM) for an instance.                          |
>
> No component depends on the others at compile-time – compose them as needed.

---

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraDatabaseInstance,
  CloudInfraDatabase,
  CloudInfraDatabaseUser,
} from '@mutinex/cloud-infra';
```

---

## Usage examples

### 1. Create a PostgreSQL instance with VPC integration

```ts
const masterSqlInstanceMeta = new CloudInfraMeta({
  name: 'master',
  domain: 'au',
  location: 'australia-southeast1',
});

const masterSqlInstance = new CloudInfraDatabaseInstance(
  masterSqlInstanceMeta,
  {
    project: 'my-project',
    databaseVersion: 'POSTGRES_17',
    rootPassword: masterInstancePassword.getVersion().secretData,
    deletionProtection: false,
    settings: {
      edition: 'ENTERPRISE',
      tier: 'db-f1-micro',
      ipConfiguration: {
        ipv4Enabled: true,
        privateNetwork: baseNetwork,
        enablePrivatePathForGoogleCloudServices: true,
      },
      availabilityType: 'ZONAL',
      backupConfiguration: {
        backupRetentionSettings: {
          retainedBackups: 10,
        },
        enabled: true,
        pointInTimeRecoveryEnabled: true,
        startTime: '14:00',
      },
    },
  }
);
```

### 2. Create a database and user with connection string

```ts
const apiDbMeta = new CloudInfraMeta({
  name: 'api',
  domain: 'au',
});

const apiDb = new CloudInfraDatabase(apiDbMeta, {
  project: 'my-project',
  instance: masterSqlInstance.getInstance().name,
});

const apiDbUserMeta = new CloudInfraMeta({
  name: 'api-user',
  domain: 'au',
});

const apiDbUser = new CloudInfraDatabaseUser(apiDbUserMeta, {
  project: 'my-project',
  instance: masterSqlInstance.getInstance().name,
  password: apiDbUserPassword.result,
});

// Create connection string for application use
const apiDbUriString = pulumi.interpolate`postgres://${apiDbUser.getName()}:${apiDbUserPassword.result}@${masterSqlInstance.getInstance().privateIpAddress}/${apiDb.getDatabase().name}`;
```

### 3. Secret management with CloudInfraSecretVersion

```ts
const masterInstancePasswordMeta = new CloudInfraMeta({
  name: 'api-sql-master-pwd',
  domain: 'au',
  location: ['australia-southeast1', 'us-central1'],
});

const masterInstancePassword = new CloudInfraSecretVersion(
  masterInstancePasswordMeta,
  {
    project: 'my-project',
    secretData: sqlConfig.password,
  }
);

const apiDbUriMeta = new CloudInfraMeta({
  name: 'api-sql-master-conn',
  domain: 'au',
  location: ['australia-southeast1', 'us-central1'],
});

const apiDbUri = new CloudInfraSecretVersion(apiDbUriMeta, {
  project: 'my-project',
  secretData: apiDbUriString,
});
```

_(Three examples – within the 4-example limit.)_

---

## Configuration highlights

All three constructors accept the corresponding Pulumi argument type
(`DatabaseInstanceArgs`, `DatabaseArgs`, `UserArgs`).

Additional behaviour:

1. **Name** defaults to `meta.getName()`.
2. **Region** for `DatabaseInstance` defaults to `deriveRegion(meta)` when not supplied.
3. `CloudInfraDatabaseUser` marks the `password` field as a secret so it's encrypted in state files.

---

## Runtime API summary

| Component          | Key getters                                 |
| ------------------ | ------------------------------------------- |
| `DatabaseInstance` | `getInstance()`, `getName()`, `getRegion()` |
| `Database`         | `getDatabase()`, `getName()`                |
| `DatabaseUser`     | `getUser()`, `getName()`                    |

Each component exposes `exportOutputs(manager)` to register itself with a
`CloudInfraOutput`.

---

## Behaviour notes

- The components intentionally stay thin – advanced settings (backups,
  replication, flags) should be provided via the underlying Pulumi arg objects.
- For IAM users supply `type: "CLOUD_IAM_SERVICE_ACCOUNT"` and the service-account email.

---

## See also

- [`components/backendservice`](../backendservice) – reference database hosts in backend workloads.
- [`core/meta`](../../core/meta) – naming & location helpers.
- [`core/output`](../../core/output) – structured stack outputs.
