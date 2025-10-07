# Service-Account Components (`CloudInfraAccount`, `CloudInfraBulkAccount`)

> Part of **`@mutinex/cloud-infra`** – a Pulumi utility library for
> provisioning GCP resources following CloudInfra naming conventions.

This package provides two thin wrappers around
[`gcp.serviceaccount.Account`](https://www.pulumi.com/registry/packages/gcp/api-docs/serviceaccount/account/):

| Component               | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `CloudInfraAccount`     | Manage **one** service-account.                                    |
| `CloudInfraBulkAccount` | Manage a **set** of service-accounts derived from a single `Meta`. |

Both components rely on a [`CloudInfraMeta`](../../core/meta) instance to
calculate predictable, policy-compliant names and locations. They add zero
runtime logic on top of the underlying Pulumi resource – the goal is to reduce
boilerplate, not to hide functionality.

## Quick reference

```ts
import {
  CloudInfraMeta,
  CloudInfraAccount,
  CloudInfraBulkAccount,
} from '@mutinex/cloud-infra';
```

- **Constructor (single):** `new CloudInfraAccount(meta, config?)`
- **Constructor (bulk):** `new CloudInfraBulkAccount(meta, config?)`
- **Direct access (both):** `account.emails[name]`, `account.members[name]`, etc.
- **Consistent API:** Single and bulk accounts use the same access pattern!
- **Record outputs:** `account.exportOutputs(outputManager)`

### `config` object (shared)

Same shape as `gcp.serviceaccount.AccountArgs` (excluding `project` which is inherited from meta)
with an optional `custom` map for the bulk component. Example fields include `description`,
`disabled`, etc.

---

## Examples

### New Getter Usage (Clean & Direct)

```ts
// Single Account - Direct access by actual name
const apiAccount = new CloudInfraAccount(apiMeta); // meta has name: 'api'
export const apiEmail = apiAccount.emails.api;
export const apiMember = apiAccount.members.api;

// Bulk Accounts - Direct access by name
const accounts = new CloudInfraBulkAccount(meta);
export const frontendEmail = accounts.emails.frontend;
export const apiServiceAccount = accounts.serviceAccounts.api;
export const apiIamMember = accounts.members.api;

// Old way (deprecated)
export const oldEmail = accounts.getAccount('frontend')?.email; // ❌ Verbose
export const oldMember = pulumi.interpolate`serviceAccount:${accounts.getAccount('api')?.email}`; // ❌ Complex
```

### 1. Regional single account (AU)

```ts
import { CloudInfraMeta, CloudInfraAccount } from '@mutinex/cloud-infra';

const meta = new CloudInfraMeta({
  name: 'api', // service-account ID will start with this
  domain: 'au', // generates the "australia-southeast1" region suffix
});

export const apiAccount = new CloudInfraAccount(meta);

// Using new direct property access (with actual name 'api')
export const apiEmail = apiAccount.emails.api;
```

### 2. Global single account with custom arguments

```ts
const meta = new CloudInfraMeta({
  name: 'scheduler',
  domain: 'gl', // global domain (no region suffix)
  omitDomain: true, // omit the domain part in the generated name
});

export const schedulerAccount = new CloudInfraAccount(meta, {
  description: 'Job Scheduler service account',
  disabled: true,
});
```

### 3. GitHub Actions service accounts (real production pattern)

```ts
const ghaAccountsMeta = new CloudInfraMeta({
  name: [`org-${pulumi.getStack()}-gha`],
  omitPrefix: true,
  omitDomain: true,
  gcpProject: baseProject.getProjectId(), // Optional project override
});

export const ghaAccounts = new CloudInfraBulkAccount(ghaAccountsMeta, {
  custom: {
    [`org-prd-gha`]: {
      description: 'GitHub Actions Service Account for Shared Project',
    },
  },
});
```

### 4. Multi-region service accounts

```ts
// Australia region accounts
export const saAu = new CloudInfraBulkAccount(
  new CloudInfraMeta({
    name: ['api', 'frontend'],
    domain: 'au',
    gcpProject: gcpProjectId, // Optional project override
  })
);

// US region accounts
export const saUs = new CloudInfraBulkAccount(
  new CloudInfraMeta({
    name: ['frontend'],
    domain: 'us',
    gcpProject: gcpProjectId, // Optional project override
  })
);

// Using new direct property access
export const apiEmailAu = saAu.emails.api;
export const frontendMemberUs = saUs.members.frontend;
```

### 5. Bypass naming restrictions for special cases

```ts
// When you need to use names that violate GCP's strict naming rules
const meta = new CloudInfraMeta({
  name: 'very-long-service-account-name-that-exceeds-normal-limits',
  domain: 'gl',
  overrideNamingRules: true, // ⚠️ Use with caution!
});

export const specialAccount = new CloudInfraAccount(meta, {
  description: 'Legacy account with non-standard naming',
});
```

### 6. Organization-level accounts with custom descriptions

```ts
const organizationGhaAccountsMeta = new CloudInfraMeta({
  name: ['provisioner', 'viewer'],
  omitPrefix: true,
  omitDomain: true,
  gcpProject: baseProject.getProjectId(), // Optional project override
});

export const organizationGhaAccounts = new CloudInfraBulkAccount(
  organizationGhaAccountsMeta,
  {
    custom: {
      provisioner: {
        description:
          'GitHub Actions Shared Service Account for Organization Provisioning',
      },
      viewer: {
        description:
          'GitHub Actions Shared Service Account for Organization Viewing',
      },
    },
  }
);
```

---

## API

### `CloudInfraAccount` (Single Account)

#### New Direct Property Access (Recommended)

| Property                | Type                         | Description                                      |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| `emails[name]`          | `pulumi.Output<string>`      | Service account email address                    |
| `ids[name]`             | `pulumi.Output<string>`      | GCP resource ID (`{project}/{name}`)             |
| `names[name]`           | `pulumi.Output<string>`      | Short name (`projects/-/serviceAccounts/{name}`) |
| `members[name]`         | `pulumi.Output<string>`      | IAM member string (`serviceAccount:email@...`)   |
| `serviceAccounts[name]` | `gcp.serviceaccount.Account` | The underlying Pulumi resource                   |

#### Legacy Methods (Deprecated)

| Method                                    | Description                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `getServiceAccount()` ⚠️                  | Returns the underlying Pulumi resource.                      |
| `getId()` / `getName()` / `getEmail()` ⚠️ | Lazily resolved Pulumi outputs for ID, short name and email. |
| `asIamMemberIdentity()` ⚠️                | Helper when creating IAM bindings elsewhere.                 |
| `exportOutputs(manager)`                  | Registers the account with a `CloudInfraOutput`.             |

### `CloudInfraBulkAccount` (Multiple Accounts)

#### New Direct Property Access (Recommended)

| Property                | Type                         | Description                                     |
| ----------------------- | ---------------------------- | ----------------------------------------------- |
| `emails[name]`          | `pulumi.Output<string>`      | Email for specific account                      |
| `ids[name]`             | `pulumi.Output<string>`      | GCP resource ID for specific account            |
| `names[name]`           | `pulumi.Output<string>`      | Short name for specific account                 |
| `members[name]`         | `pulumi.Output<string>`      | IAM member string for specific account          |
| `serviceAccounts[name]` | `gcp.serviceaccount.Account` | Underlying Pulumi resource for specific account |

#### Legacy Methods (Deprecated)

| Method                       | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| `getAccounts()` ⚠️           | All resources keyed by original input name.    |
| `getAccount(name)` ⚠️        | Single account or `undefined`.                 |
| `asIamMemberIdentities()` ⚠️ | Array of IAM identities (useful for loops).    |
| `exportOutputs(manager)`     | Registers every account in the output manager. |

---

## Behaviour notes

1. **Naming:** The generated Service-Account ID follows the pattern
   `<prefix>-<name>-<location>` unless `omitPrefix` / `omitDomain` overrides are
   used. The _prefix_ defaults to the Pulumi project name; the _location_ is
   derived from `domain` or `location` settings in `CloudInfraMeta`.
2. **Validation:** IDs are validated against GCP naming rules via Zod; invalid
   inputs throw early during preview. Use `overrideNamingRules: true` in
   `CloudInfraMeta` to bypass validation for special cases.
3. **IAM members:** Neither component automatically creates IAM bindings – use
   `members` property to get IAM-ready strings, or `emails` for the raw email.
4. **No side-effects:** The wrappers do not introduce additional Pulumi
   resources; they only call the underlying `gcp.serviceaccount.Account`
   constructor and provide convenience helpers.

---

## See also

- [`core/meta`](../../core/meta) – generates consistent names & locations.
- [`core/output`](../../core/output) – structured stack outputs.
- [`components/role`](../role) – create IAM roles that reference the identities
  produced by this component.
