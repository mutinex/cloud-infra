import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import {
  createGcpServiceAccount,
  CloudInfraAccountConfig,
  CloudInfraAccountPulumiConfig,
  CloudInfraAccountBase,
} from './common';
import { resolveMeta, type NamingArgs } from '../../core/component';

/**
 * A wrapper around Google Cloud Service-Account(s) that enforces CloudInfra
 * naming conventions and provides a clean, typed API for Pulumi programs.
 *
 * Merged single+bulk component (Wave 3 W3-C): accepts a SINGLE name (`string`)
 * or a SET of names (`string[]`) through one class, branching by *arity* to
 * preserve the exact pre-merge single vs bulk component URNs, child generated
 * names (== `accountId` == SA email identity, F1) and `getAccounts()`
 * input-name keys.
 *
 * @example Single account
 * ```ts
 * const sa = new CloudInfraAccount("application", { domain: "au" });
 * export const serviceAccountEmail = sa.getEmail();
 * ```
 *
 * @example Bulk set with shared + per-item config
 * ```ts
 * const accounts = new CloudInfraAccount(["primary", "global"], {
 *   description: "Shared",
 *   custom: { global: { description: "Different" } },
 * });
 * const apiSa = accounts.getAccount("primary");
 * ```
 */
export interface CloudInfraAccountIamMemberIdentity {
  /** The Pulumi URN-friendly name (matches `CloudInfraMeta.getName()`). */
  urnName: string;
  /** Resolved email address of the Service-Account. */
  email: pulumi.Output<string>;
}

/** Pulumi type token for the single service-account component. */
export const ACCOUNT_TYPE = 'cloud-infra:account:CloudInfraAccount';
/** Pulumi type token for the bulk service-account component (array arity). */
export const ACCOUNT_BULK_TYPE = 'cloud-infra:account:CloudInfraBulkAccount';

/**
 * Name-first construction args for `CloudInfraAccount` (single arity).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the account config
 * ({@link CloudInfraAccountConfig}) into a single args object, so an account can
 * be built as `new CloudInfraAccount("application", { domain: "au" })`. The
 * naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the account config.
 */
export type CloudInfraAccountArgs = NamingArgs & CloudInfraAccountConfig;

/**
 * Name-first construction args for `CloudInfraAccount` accepting a `string[]`
 * (bulk arity): {@link CloudInfraAccountArgs} plus the per-item `custom`
 * overrides block.
 */
export type CloudInfraAccountBulkArgs = NamingArgs &
  CloudInfraAccountConfig & {
    custom?: Record<string, CloudInfraAccountConfig>;
  };

export class CloudInfraAccount extends CloudInfraAccountBase {
  private meta: CloudInfraMeta;
  /**
   * The single underlying Service-Account (single arity only). Frozen public
   * accessor — consumed by goldens and downstream callers. Backed by a getter
   * (NOT a definite-assignment field) so the declared type matches runtime
   * nullability: on a SINGLE instance it returns the lone account (byte-identical
   * to the pre-merge field); on a BULK instance it THROWS via {@link requireSingle}
   * instead of silently being `undefined` while typed non-optional (NPE footgun).
   */
  public get serviceAccount(): gcp.serviceaccount.Account {
    return this.requireSingle('serviceAccount');
  }
  /** `true` when constructed with a `string[]` (bulk arity). */
  private readonly isBulk: boolean;
  /**
   * Explicit, PUBLIC bulk marker consumed by the access-matrix principal
   * expander ({@link PrincipalFactory.expandPrincipals}). Since the merged single
   * arity now also exposes `getAccounts()`, the presence of `getAccounts()` alone
   * no longer distinguishes a bulk component; this marker (set `true` ONLY for
   * the array arity) lets the expander expand genuine bulk and resolve a single
   * account through the wrapper path. Not a resource input — does not affect any
   * emitted resource.
   */
  public readonly isCloudInfraBulkResource: boolean;
  /** The single input name (single arity only); `undefined` for bulk. */
  private readonly singleInputName?: string;
  private configs: Record<string, CloudInfraAccountPulumiConfig> = {};
  private iamMembersBulk: Record<string, gcp.serviceaccount.IAMMember[]> = {};
  private iamMembersSingle: gcp.serviceaccount.IAMMember[] = [];

  /**
   * Name-first construction with a SINGLE name (v2 DX, preferred). Naming
   * metadata (`domain` / `location` / `prefix` / `naming`) and the account config
   * are folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraAccountArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * Name-first construction with a SET of names (v2 DX). Produces today's
   * `CloudInfraBulkAccount` behaviour: one account per input name plus per-item
   * `custom` overrides.
   */
  constructor(
    names: string[],
    args?: CloudInfraAccountBulkArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overloads
   * `new CloudInfraAccount(name | names, args, opts)`. Retained for backward
   * compatibility; produces identical resources. A `meta` whose `name` is an
   * array selects the bulk arity (and accepts a `custom` block on `config`).
   */
  constructor(
    meta: CloudInfraMeta,
    config?: CloudInfraAccountConfig & {
      custom?: Record<string, CloudInfraAccountConfig>;
    },
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrNamesOrMeta: string | string[] | CloudInfraMeta,
    argsOrConfig:
      | CloudInfraAccountArgs
      | CloudInfraAccountBulkArgs
      | (CloudInfraAccountConfig & {
          custom?: Record<string, CloudInfraAccountConfig>;
        }) = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Resolve the (name|names|meta, args) pair into a CloudInfraMeta + the
    // component config (naming fields stripped for the name-first paths).
    let meta: CloudInfraMeta;
    let config: CloudInfraAccountConfig & {
      custom?: Record<string, CloudInfraAccountConfig>;
    };
    if (Array.isArray(nameOrNamesOrMeta)) {
      const { domain, location, prefix, naming, omitPrefix, omitLocation, preview, ...rest } =
        argsOrConfig as CloudInfraAccountBulkArgs;
      meta = resolveMeta(nameOrNamesOrMeta, {
        domain,
        location,
        prefix,
        naming,
        omitPrefix,
        omitLocation,
        preview,
      });
      config = rest;
    } else if (nameOrNamesOrMeta instanceof CloudInfraMeta) {
      meta = nameOrNamesOrMeta;
      config = argsOrConfig as CloudInfraAccountConfig & {
        custom?: Record<string, CloudInfraAccountConfig>;
      };
    } else {
      const { domain, location, prefix, naming, omitPrefix, omitLocation, preview, ...rest } =
        argsOrConfig as CloudInfraAccountArgs;
      meta = resolveMeta(nameOrNamesOrMeta, {
        domain,
        location,
        prefix,
        naming,
        omitPrefix,
        omitLocation,
        preview,
      });
      config = rest;
    }

    // Arity is decided by the resolved input name, NOT by the surface overload.
    const inputName = meta.getInputName();
    const bulk = Array.isArray(inputName);

    // Component node identity differs by arity to preserve the exact pre-merge
    // URNs:
    //   • single → `cloud-infra:account:CloudInfraAccount` + `meta.getName()`
    //   • bulk   → `cloud-infra:account:CloudInfraBulkAccount` +
    //              `inputNames.join('-') + '-accounts'`
    const typeToken = bulk ? ACCOUNT_BULK_TYPE : ACCOUNT_TYPE;
    const componentLabel = bulk
      ? (inputName as string[]).join('-').concat('-accounts')
      : meta.getName();

    // Register the component node. Children parent under `this`. The generated
    // NAME (used as the SA `accountId` → email identity) is unchanged (F1).
    super(
      typeToken,
      componentLabel,
      componentLabel,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info(
      bulk
        ? 'Initializing bulk service account component'
        : 'Initializing single service account component',
      {
        component: 'account',
        operation: 'constructor',
      }
    );

    this.meta = meta;
    this.isBulk = bulk;
    this.isCloudInfraBulkResource = bulk;

    const names = meta.getNames();

    if (bulk) {
      // ---- Bulk arity: one account per input name, per-item `custom` merge ----
      const { custom = {}, ...commonConfig } = config || {};

      for (const key of Object.keys(names)) {
        const generatedName = names[key];
        const perAccountRaw = custom[key] || {};
        const rawConfig = { ...commonConfig, ...perAccountRaw };

        // Each SA moves UNDER this component but was created FLAT at the stack
        // root in v1 → childOpts() gives each its own per-item alias back to its
        // old root-level URN. `gcp.serviceaccount.Account` has NO `labels` field
        // → args are NOT passed through withLabels.
        const { account, parsedConfig } = createGcpServiceAccount({
          meta,
          rawConfig,
          inputName: key,
          pulumiResourceName: generatedName,
          opts: this.childOpts(),
        });

        this.configs[key] = parsedConfig;
        this.addAccount(key, account);
      }

      this.registerOutputs({ serviceAccounts: this.serviceAccounts });
    } else {
      // ---- Single arity: exactly one account, no `custom` block ----
      const singleName = inputName as string;
      this.singleInputName = singleName;

      // The SA moves UNDER this component (URN gains the component parent path).
      // It was created FLAT at the stack root in v1, so childOpts() aliases it
      // back to its old root-level URN for a non-destructive migration.
      // pulumiResourceName === componentLabel === meta.getName() === the single
      // generated name (F1) — byte-identical to the pre-merge single component.
      const { account, parsedConfig } = createGcpServiceAccount({
        meta,
        rawConfig: (config as CloudInfraAccountConfig) || {},
        inputName: singleName,
        pulumiResourceName: componentLabel,
        opts: this.childOpts(),
      });

      this.configs[singleName] = parsedConfig;
      // The frozen public `serviceAccount` accessor is a getter backed by the
      // single entry registered here via addAccount() — no separate field to
      // assign. requireSingle() returns this exact account on a single instance.
      this.addAccount(singleName, account);

      this.registerOutputs({ serviceAccount: account });
    }
  }

  // ── Single-arity accessors (no-arg) ──────────────────────────────────────

  /**
   * Returns the underlying Pulumi `gcp.serviceaccount.Account` resource
   * (single arity).
   * @deprecated Use `serviceAccounts[name]` instead for direct access
   */
  public getServiceAccount(): gcp.serviceaccount.Account {
    return this.requireSingle('getServiceAccount');
  }

  /**
   * GCP resource ID ( `{project}/{name}` ) for the single account.
   * @deprecated Use `ids[name]` instead for direct access
   */
  public getId(): pulumi.Output<string> {
    return this.requireSingle('getId').id;
  }

  /**
   * Full email address of the single Service-Account.
   * @deprecated Use `emails[name]` instead for direct access
   */
  public getEmail(): pulumi.Output<string> {
    return this.requireSingle('getEmail').email;
  }

  /**
   * Helper that exposes the single account in a format suitable for IAM bindings.
   * @deprecated Use `members[name]` for the IAM member string, or `emails[name]` for email
   */
  public asIamMemberIdentity(): CloudInfraAccountIamMemberIdentity {
    return {
      urnName: this.meta.getName(),
      email: this.requireSingle('asIamMemberIdentity').email,
    };
  }

  // ── Shared / bulk accessors ──────────────────────────────────────────────

  /**
   * Short name (`projects/-/serviceAccounts/{name}`) of the account.
   *
   * - **Single arity** — call with no argument.
   * - **Bulk arity** — pass the *input* name (returns `undefined` if unknown).
   * @deprecated Use `names[name]` instead for direct access
   */
  public getName(): pulumi.Output<string>;
  public getName(name: string): pulumi.Output<string> | undefined;
  public getName(name?: string): pulumi.Output<string> | undefined {
    if (name === undefined) {
      return this.requireSingle('getName').name;
    }
    const account = this.serviceAccounts[name];
    return account ? account.name : undefined;
  }

  /**
   * All Service-Account resources keyed by *input* name (bulk + single).
   * @deprecated Use `serviceAccounts` property instead for direct access
   */
  public getAccounts(): Record<string, gcp.serviceaccount.Account> {
    return this.serviceAccounts;
  }

  /**
   * Returns a single Service-Account by its *input* name or `undefined`.
   * @deprecated Use `serviceAccounts[name]` for direct access
   */
  public getAccount(name: string): gcp.serviceaccount.Account | undefined {
    return this.serviceAccounts[name];
  }

  /**
   * Returns IAM identities for every managed account.
   * @deprecated Use `members` property for IAM member strings, or `emails` for email outputs
   */
  public asIamMemberIdentities(): CloudInfraAccountIamMemberIdentity[] {
    return Object.entries(this.serviceAccounts).map(([inputName, account]) => ({
      urnName: this.meta.getNames()[inputName],
      email: account.email,
    }));
  }

  /**
   * Registers this component's outputs with the given {@link CloudInfraOutput}
   * manager so they show up in `pulumi stack output`.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    if (this.isBulk) {
      for (const [inputName, account] of Object.entries(this.serviceAccounts)) {
        manager.record(
          'gcp:serviceaccount:Account',
          inputName,
          this.meta,
          account
        );
      }
      return;
    }
    const grouping = this.singleInputName as string;
    manager.record(
      'gcp:serviceaccount:Account',
      grouping,
      this.meta,
      this.requireSingle('exportOutputs')
    );
  }

  /**
   * Any additional IAM member resources that were created.
   *
   * Single arity returns the single-account `IAMMember[]`; bulk arity returns the
   * per-input-name record (preserved on the {@link CloudInfraBulkAccount} alias).
   */
  public getIamMembers():
    | gcp.serviceaccount.IAMMember[]
    | Record<string, gcp.serviceaccount.IAMMember[]> {
    return this.isBulk ? this.iamMembersBulk : this.iamMembersSingle;
  }

  /** Returns the lone account for single arity, or throws on a bulk instance. */
  private requireSingle(op: string): gcp.serviceaccount.Account {
    if (this.isBulk) {
      throw new ValidationError(
        `CloudInfraAccount.${op}() with no name is only valid for a single (string) account. This is a bulk (array) instance — use getAccount(name) / getAccounts().`,
        'account',
        op
      );
    }
    return this.serviceAccounts[this.singleInputName as string];
  }
}
