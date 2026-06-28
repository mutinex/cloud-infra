/**
 * Part of **`@mutinex/cloud-infra`** — v2 simplification program, Wave 4
 * capstone: the {@link CloudInfraService} convention layer.
 *
 * `CloudInfraService` is the headline "easy building blocks" ergonomic win: a
 * service author declares the shared `{ domain, location }` naming context
 * **once**, and gets factory methods that inherit it and auto-collect every
 * component's outputs into a single internal {@link CloudInfraOutput} manager —
 * instead of repeating `{ domain, location }` on every component and hand-wiring
 * an output manager.
 *
 * ## What it is — and is NOT
 *
 * - It is a **plain coordinator**, NOT a `pulumi.ComponentResource` parent. It
 *   does NOT create a Pulumi node and does NOT nest the factory-produced
 *   components beneath itself. This is deliberate: nesting children under a
 *   service parent would change their URNs. A factory-produced component is
 *   **byte-identical** to direct name-first construction (same generated name,
 *   same URN, same args) — `svc.bucket('assets')` is exactly
 *   `new CloudInfraBucket('assets', { domain: svc.domain, location: svc.location })`
 *   followed by `.exportOutputs(svc's manager)`.
 *
 * - It carries **NO IAM surface**. There is deliberately no `.grant()`,
 *   `.canRead()`, or any other access-matrix method on this class. IAM stays in
 *   the central access-matrix module (`createAccessMatrix` / `grant` / `ref`) —
 *   a firm architectural rule: access is declared in ONE place, not scattered
 *   across service definitions. Authors collect resources here and wire IAM in
 *   the access matrix as before.
 *
 * ## Shared-args merge & auto-registration
 *
 * Every factory merges the service's shared {@link NamingArgs}
 * (`{ domain, location, prefix, naming }`) **UNDER** the per-call args, so a
 * per-call value overrides the shared default (`{ ...shared, ...perCallArgs }`).
 * The constructed component is then auto-registered into the internal output
 * manager via the component's own `exportOutputs(manager)`. Registration can be
 * skipped per call with `opts.register === false` (default: register).
 *
 * @example
 * ```ts
 * const svc = new CloudInfraService('payments', { domain: 'au', location: 'australia-southeast1' });
 * const bucket = svc.bucket('assets');                // inherits { domain:'au', location:'…' }
 * const sa = svc.account('runner');                   // auto-registered
 * const job = svc.cloudRunJob('migrate', { template: { … } });
 * export const outputs = svc.outputs();               // flat wire of all registered resources
 * ```
 *
 * @module @mutinex/cloud-infra/core/service
 */

import type * as pulumi from '@pulumi/pulumi';

import { CloudInfraOutput } from '../output';
import type { NamingArgs } from '../component';

import {
  CloudInfraBucket,
  type CloudInfraBucketArgs,
} from '../../components/bucket';
import {
  CloudInfraAccount,
  type CloudInfraAccountArgs,
} from '../../components/account';
import {
  CloudInfraCloudRunService,
  type CloudInfraCloudRunServiceArgs,
} from '../../components/cloudrunservice';
import {
  CloudInfraCloudRunJob,
  type CloudInfraCloudRunJobArgs,
} from '../../components/cloudrunjob';
import {
  CloudInfraSecretVersion,
  type CloudInfraSecretVersionArgs,
} from '../../components/secret';
import {
  CloudInfraBackendService,
  type CloudInfraBackendServiceArgs,
} from '../../components/backendservice';
import { CloudInfraAlb, type CloudInfraAlbArgs } from '../../components/alb';
import {
  CloudInfraComputeInstance,
  type CloudInfraComputeInstanceArgs,
} from '../../components/instance';
import {
  CloudInfraCertificateMap,
  type CloudInfraCertificateMapArgs,
} from '../../components/certificatemap';
import {
  CloudInfraRepository,
  type CloudInfraRepositoryArgs,
} from '../../components/repository';
import {
  CloudInfraDatabase,
  type CloudInfraDatabaseArgs,
} from '../../components/database';

/**
 * The shared naming context a {@link CloudInfraService} declares once and folds
 * UNDER every factory call. This is exactly the {@link NamingArgs} surface the
 * underlying components already accept — no new naming/region handling is
 * introduced.
 */
export interface CloudInfraServiceArgs {
  /**
   * Org domain (`au` | `us` | `gl`). Inherited by every factory call.
   *
   * INTENTIONALLY REQUIRED here, even though the underlying
   * {@link NamingArgs.domain} is optional: declaring the domain once is the
   * whole ergonomic point of the service. A direct component caller may omit
   * `domain` (falling back to project/meta defaults); the service forecloses
   * that path by design and always folds an explicit `domain` under each call.
   */
  domain: NamingArgs['domain'];
  /** Default GCP location/region for the service's regional components. */
  location?: NamingArgs['location'];
  /** Default prefix override for the service's components. */
  prefix?: NamingArgs['prefix'];
  /**
   * Default naming mode for the service's components.
   *
   * @deprecated Mirrors the underlying {@link NamingArgs.naming} deprecation;
   * prefer the flat `omitPrefix`/`omitLocation`/`preview` flags per call.
   */
  naming?: NamingArgs['naming'];
}

/**
 * Per-call factory options: the underlying component's
 * `pulumi.ComponentResourceOptions` plus a {@link CloudInfraServiceFactoryOptions.register}
 * flag controlling auto-registration into the service's output manager.
 */
export interface CloudInfraServiceFactoryOptions
  extends pulumi.ComponentResourceOptions {
  /**
   * When `false`, skip auto-registering the produced component into the
   * service's internal output manager. Defaults to `true` (register).
   */
  register?: boolean;
}

/**
 * Anything the factories construct: a component exposing `exportOutputs` so it
 * can self-register into a {@link CloudInfraOutput} manager.
 */
interface ExportableComponent {
  exportOutputs(manager: CloudInfraOutput): void;
}

/**
 * **`CloudInfraService`** — a plain coordinator that captures a shared naming
 * context once and hands out factory methods which inherit it and auto-collect
 * their outputs.
 *
 * NOT a `pulumi.ComponentResource` (no parent node, no URN nesting): every
 * factory-produced component is byte-identical to the equivalent direct
 * name-first construction. NO IAM lives here — access is declared in the central
 * access-matrix module (see class/module docs).
 */
export class CloudInfraService {
  /** Logical handle for readability / output grouping. NOT injected into child resource names. */
  public readonly name: string;
  /** Shared org domain folded under every factory call. */
  public readonly domain: NamingArgs['domain'];
  /** Shared default location/region folded under every factory call. */
  public readonly location?: NamingArgs['location'];
  /** Shared default prefix folded under every factory call. */
  public readonly prefix?: NamingArgs['prefix'];
  /** Shared default naming mode folded under every factory call. */
  public readonly naming?: NamingArgs['naming'];

  /** The internal output manager every factory auto-registers into. */
  private readonly _outputManager: CloudInfraOutput;

  /**
   * @param name A logical handle for the service — used purely for readability
   *   and output grouping. It is **NOT** injected into any child resource name,
   *   so factory-produced resources stay byte-identical to direct construction.
   * @param args The shared {@link CloudInfraServiceArgs} naming context
   *   (`domain` required; `location`/`prefix`/`naming` optional) inherited by
   *   every factory call.
   */
  constructor(name: string, args: CloudInfraServiceArgs) {
    this.name = name;
    this.domain = args.domain;
    this.location = args.location;
    this.prefix = args.prefix;
    this.naming = args.naming;
    this._outputManager = new CloudInfraOutput();
  }

  /**
   * The shared {@link NamingArgs} this service folds UNDER each factory call.
   * Only keys the author actually supplied are present, so an unset
   * `location`/`prefix`/`naming` stays absent (never forced to `undefined`),
   * keeping the resolved component args indistinguishable from a hand-written
   * direct construction that omitted them.
   * @private
   */
  private get sharedNaming(): NamingArgs {
    const shared: NamingArgs = { domain: this.domain };
    if (this.location !== undefined) shared.location = this.location;
    if (this.prefix !== undefined) shared.prefix = this.prefix;
    if (this.naming !== undefined) shared.naming = this.naming;
    return shared;
  }

  /**
   * The internal {@link CloudInfraOutput} manager, exposed for advanced /
   * selective use (e.g. `manager.getOutputs()` for the nested wire, or manual
   * `record(...)` calls). For the common case prefer {@link outputs}.
   */
  public get outputManager(): CloudInfraOutput {
    return this._outputManager;
  }

  /**
   * The flat output wire (`getFlatOutputs()`) collected from every
   * auto-registered component — one `pulumi.Output<string>` per scalar field,
   * keyed `<domain>.<service>[.<region>].<name>.<field>`.
   */
  public outputs(): Record<string, pulumi.Output<string>> {
    return this._outputManager.getFlatOutputs();
  }

  /**
   * Shared factory core: merge the service's shared {@link NamingArgs} UNDER the
   * per-call args (per-call wins), split the `register` flag out of `opts`,
   * construct the component via `construct(mergedArgs, componentOpts)`, then
   * auto-register it into the internal manager unless `register === false`.
   *
   * @private
   */
  private build<TArgs extends NamingArgs, TComponent extends ExportableComponent>(
    args: TArgs | undefined,
    opts: CloudInfraServiceFactoryOptions | undefined,
    construct: (
      mergedArgs: TArgs,
      componentOpts: pulumi.ComponentResourceOptions | undefined
    ) => TComponent
  ): TComponent {
    // Shared naming merged UNDER the per-call args: a per-call key overrides the
    // shared default (`{ ...shared, ...perCall }`).
    //
    // The `as TArgs` assertion is SOUND, not just convenient: `args` is already
    // typed `TArgs | undefined`, and `sharedNaming` only ever contributes
    // OPTIONAL NamingArgs keys (domain/location/prefix/naming). Spreading it
    // UNDER `args` can therefore only ADD optional keys — it can never drop or
    // override a REQUIRED non-naming field, every one of which lives in `args`.
    // (If a future edit ever routed required component data through
    // `sharedNaming`, this assertion would silently mask the gap — keep
    // required fields in the per-call `args`.)
    const mergedArgs = {
      ...this.sharedNaming,
      ...(args ?? {}),
    } as TArgs;

    // Separate the service-only `register` flag from the component's Pulumi opts.
    const { register, ...componentOpts } = opts ?? {};
    const hasComponentOpts = Object.keys(componentOpts).length > 0;

    const component = construct(
      mergedArgs,
      hasComponentOpts ? (componentOpts as pulumi.ComponentResourceOptions) : undefined
    );

    if (register !== false) {
      component.exportOutputs(this._outputManager);
    }

    return component;
  }

  // --- Factory methods --------------------------------------------------------
  //
  // Each merges the service's shared { domain, location, prefix, naming } UNDER
  // the per-call args, constructs the NAME-FIRST component, auto-registers it
  // (unless opts.register === false), and returns it. The produced component is
  // byte-identical to the equivalent direct name-first construction.

  /** Create a {@link CloudInfraBucket} (single name) inheriting the shared naming context. */
  public bucket(
    name: string,
    args?: CloudInfraBucketArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraBucket {
    return this.build(args, opts, (a, o) => new CloudInfraBucket(name, a, o));
  }

  /** Create a {@link CloudInfraAccount} (service account) inheriting the shared naming context. */
  public account(
    name: string,
    args?: CloudInfraAccountArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraAccount {
    return this.build(args, opts, (a, o) => new CloudInfraAccount(name, a, o));
  }

  /** Create a {@link CloudInfraCloudRunService} inheriting the shared naming context. */
  public cloudRun(
    name: string,
    args: CloudInfraCloudRunServiceArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraCloudRunService {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraCloudRunService(name, a, o)
    );
  }

  /** Create a {@link CloudInfraCloudRunJob} inheriting the shared naming context. */
  public cloudRunJob(
    name: string,
    args: CloudInfraCloudRunJobArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraCloudRunJob {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraCloudRunJob(name, a, o)
    );
  }

  /** Create a {@link CloudInfraSecretVersion} inheriting the shared naming context. */
  public secret(
    name: string,
    args: CloudInfraSecretVersionArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraSecretVersion {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraSecretVersion(name, a, o)
    );
  }

  /** Create a {@link CloudInfraBackendService} inheriting the shared naming context. */
  public backendService(
    name: string,
    args?: CloudInfraBackendServiceArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraBackendService {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraBackendService(name, a, o)
    );
  }

  /** Create a {@link CloudInfraAlb} inheriting the shared naming context. */
  public alb(
    name: string,
    args: CloudInfraAlbArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraAlb {
    return this.build(args, opts, (a, o) => new CloudInfraAlb(name, a, o));
  }

  /** Create a {@link CloudInfraComputeInstance} inheriting the shared naming context. */
  public instance(
    name: string,
    args: CloudInfraComputeInstanceArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraComputeInstance {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraComputeInstance(name, a, o)
    );
  }

  /** Create a {@link CloudInfraCertificateMap} inheriting the shared naming context. */
  public certificateMap(
    name: string,
    args: CloudInfraCertificateMapArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraCertificateMap {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraCertificateMap(name, a, o)
    );
  }

  /** Create a {@link CloudInfraRepository} inheriting the shared naming context. */
  public repository(
    name: string,
    args?: CloudInfraRepositoryArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraRepository {
    return this.build(
      args,
      opts,
      (a, o) => new CloudInfraRepository(name, a, o)
    );
  }

  /** Create a {@link CloudInfraDatabase} inheriting the shared naming context. */
  public database(
    name: string,
    args: CloudInfraDatabaseArgs,
    opts?: CloudInfraServiceFactoryOptions
  ): CloudInfraDatabase {
    return this.build(args, opts, (a, o) => new CloudInfraDatabase(name, a, o));
  }
}
