/**
 * @module @mutinex/cloud-infra/core/reference
 */
import * as pulumi from '@pulumi/pulumi';
import * as crypto from 'crypto';
import { getDefaultOutputKey, resourceTypeMap } from './config';
import type {
  ReferenceDomain,
  ReferenceGetOptions,
  ReferenceOptions,
  ReferenceRecord,
  ReferenceWithDomainConfig,
  ResourceOutput,
  StackOutputs,
} from './types';

/**
 * The fields surfaced as lazy `pulumi.Output<string>` on a {@link ReferenceRecord}.
 * @internal
 */
type RecordField = 'id' | 'name' | 'email' | 'member' | 'projectId' | 'version';

/**
 * The resource type assumed by `get(name)` when no `{ type }` is supplied.
 * Matches the service-account aliases in `config.ts` and the access-matrix
 * `resourceType || 'account'` default, so the no-type path resolves service
 * accounts (the most common cross-stack reference).
 * @internal
 */
const DEFAULT_RESOURCE_TYPE = 'account';

/**
 * Manages references to resources from other Pulumi stacks, providing a simplified
 * and consistent interface for consuming their outputs.
 *
 * This class builds on `pulumi.StackReference` to offer a more opinionated,
 * type-safe, and developer-friendly API. It handles the retrieval and caching
 * of stack outputs and provides strongly-typed accessors for common resource
 * properties. It assumes that the source stack was structured using
 * {@link @mutinex/cloud-infra/core/output#CloudInfraOutput}.
 *
 * @example Intuitive API (preferred)
 * ```ts
 * import { CloudInfraReference } from "@mutinex/cloud-infra/core/reference";
 *
 * const foundation = new CloudInfraReference("mutiny-group/foundation/prd", {
 *   domain: "au",
 * });
 *
 * const sa = foundation.get("my-app");      // resolve once
 * export const saEmail = sa.email;          // lazy pulumi.Output<string>
 * export const saMember = sa.member;
 * export const saIdentifier = sa.identifier; // deterministic string (F4)
 *
 * // Disambiguate a name that exists under multiple types:
 * const bucketId = foundation.get("archive", { type: "bucket" }).id;
 * ```
 *
 * @example Legacy API (deprecated, still supported)
 * ```ts
 * const foundation = new CloudInfraReference({
 *   stack: "mutiny-group/foundation/prd",
 *   domain: "au",
 * });
 * export const vpcId = foundation.getId("network", "default");
 * export const saEmail = foundation.getEmail("service-account", "my-app");
 * ```
 */
export class CloudInfraReference {
  private readonly outputKey: string;
  // Store only the StackReference; fetch outputs on demand so we always
  // get the latest values from the target stack instead of relying on a
  // potentially stale cached object.
  private readonly stackRef: pulumi.StackReference;
  private readonly domain: ReferenceDomain;
  private readonly stack: string;
  /**
   * When `true`, this reference resolves outputs in domain-optional mode: it
   * reads flat `root[name]` string values (the former `ReferenceWithoutDomain`
   * behaviour) instead of the nested `root[domain][type][name]` wire.
   * @private
   */
  private readonly domainOptional: boolean;

  /**
   * Caches `pulumi.StackReference` instances to avoid creating duplicates for
   * the same stack within a single Pulumi program. The cache key is the
   * fully-qualified stack name.
   * @private
   */
  private static stackRefCache = new Map<string, pulumi.StackReference>();

  /**
   * Maximum number of cached stack references. When exceeded, the least recently
   * used entries will be evicted.
   * @private
   */
  private static readonly maxCacheSize = 100;

  /**
   * Track access order for LRU eviction
   * @private
   */
  private static cacheAccessOrder: string[] = [];

  /**
   * Generates a unique, collision-resistant name for a StackReference.
   * Uses a hash to ensure uniqueness while keeping the name readable.
   *
   * @param stack - The fully-qualified stack name
   * @returns A safe, unique name for the StackReference
   * @private
   */
  private static generateSafeName(stack: string): string {
    // Create a short hash of the full stack name to ensure uniqueness
    const hash = crypto
      .createHash('sha256')
      .update(stack)
      .digest('hex')
      .substring(0, 8);

    // Create a readable prefix from the stack name
    const parts = stack.split('/');
    const pulumiProject = parts.join('-').replace(/[^A-Za-z0-9_-]/g, '-');

    // Combine for both readability and uniqueness
    return `stackRef-${pulumiProject}-${hash}`;
  }

  /**
   * Updates the LRU access order for cache management
   * @param key - The cache key that was accessed
   * @private
   */
  private static updateAccessOrder(key: string): void {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(key);
  }

  /**
   * Evicts the least recently used cache entries if the cache size exceeds the maximum
   * @private
   */
  private static evictIfNeeded(): void {
    while (
      this.stackRefCache.size >= this.maxCacheSize &&
      this.cacheAccessOrder.length > 0
    ) {
      const lruKey = this.cacheAccessOrder.shift();
      if (lruKey) {
        this.stackRefCache.delete(lruKey);
      }
    }
  }

  /**
   * Retrieves a `pulumi.StackReference` from the cache or creates a new one
   * if it doesn't exist. This ensures that multiple `CloudInfraReference` instances
   * pointing to the same stack reuse the same underlying `StackReference` object.
   *
   * @param stack - The fully-qualified name of the stack in the format
   *   `organization/project/environment`.
   * @returns A `pulumi.StackReference` instance.
   * @private
   */
  public static getStackRef(stack: string): pulumi.StackReference {
    const cached = this.stackRefCache.get(stack);
    if (cached) {
      this.updateAccessOrder(stack);
      return cached;
    }

    // Evict LRU entries if needed before adding new one
    this.evictIfNeeded();

    const safeName = this.generateSafeName(stack);
    const ref = new pulumi.StackReference(safeName, { name: stack });

    this.stackRefCache.set(stack, ref);
    this.updateAccessOrder(stack);

    return ref;
  }

  /**
   * Clears the entire stack reference cache. Useful for testing or
   * when you need to force fresh references.
   * @public
   */
  public static clearCache(): void {
    this.stackRefCache.clear();
    this.cacheAccessOrder = [];
  }

  /**
   * Gets the current cache size for monitoring purposes
   * @returns The number of cached stack references
   * @public
   */
  public static getCacheSize(): number {
    return this.stackRefCache.size;
  }

  /**
   * Creates a new `CloudInfraReference` using the intuitive positional form.
   *
   * @param stack - The fully-qualified stack name in
   *   `organization/project/environment` format.
   * @param options - Optional `{ domain?, outputKey? }`. Omit `domain` for
   *   domain-optional (flat-output) resolution.
   */
  constructor(stack: string, options?: ReferenceOptions);
  /**
   * Creates a new `CloudInfraReference` using the legacy config-object form.
   *
   * @deprecated Pass the stack positionally instead:
   *   `new CloudInfraReference(stack, { domain })`.
   * @param config - `{ stack, domain, outputKey? }`. See
   *   {@link ReferenceWithDomainConfig}.
   */
  constructor(config: ReferenceWithDomainConfig);
  constructor(
    stackOrConfig: string | ReferenceWithDomainConfig,
    options?: ReferenceOptions
  ) {
    let stack: string;
    let domain: string | undefined;
    let outputKey: string | undefined;

    if (typeof stackOrConfig === 'string') {
      stack = stackOrConfig;
      domain = options?.domain;
      outputKey = options?.outputKey;
    } else {
      stack = stackOrConfig.stack;
      domain = stackOrConfig.domain;
      outputKey = stackOrConfig.outputKey;
    }

    if (stack.split('/').length !== 3) {
      throw new Error(
        "Stack must be in 'organization/project/environment' format"
      );
    }

    this.stack = stack;
    this.domain = { domain: domain ?? '' };
    this.domainOptional = domain === undefined;
    // Only consult the Pulumi config fallback when we actually use the nested
    // wire; domain-optional mode reads `stackRef.outputs` directly and never
    // touches the output key.
    this.outputKey = this.domainOptional
      ? (outputKey ?? '')
      : (outputKey ?? getDefaultOutputKey());

    // Cache the StackReference
    this.stackRef = CloudInfraReference.getStackRef(stack);
  }

  /**
   * Resolves a specific resource from the referenced stack's outputs based on
   * its type, name, and the configured domain.
   *
   * This is the core internal method for data retrieval. It uses a map of
   * aliases (e.g., "sa" -> "gcp:serviceaccount:Account") to simplify lookups.
   *
   * @param resourceType - The type of the resource to resolve. Can be a short
   *   alias (e.g., "bucket") or the full Pulumi type name.
   * @param name - The grouping key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` that resolves to the raw resource object.
   * @throws An error if the resource cannot be found in the outputs.
   * @private
   */
  private resolve(
    resourceType: string,
    name: string,
    domainOverride?: string
  ): pulumi.Output<ResourceOutput> {
    // Domain-optional mode is an INSTANCE INVARIANT fixed at construction: it
    // reads a fundamentally different (flat) wire, so a per-call `domain`/`type`
    // can never flip the resolution strategy. Reject a domain override rather
    // than silently switching wire formats.
    if (this.domainOptional) {
      if (domainOverride !== undefined) {
        throw new Error(
          `Cannot use a per-lookup 'domain' on a domain-optional reference ` +
            `(stack '${this.stack}' was constructed without a domain). ` +
            `Construct the reference with a domain to use domain-scoped lookups.`
        );
      }
      return this.resolveDomainOptional(name);
    }

    const domain = domainOverride ?? this.domain.domain;
    const normalizedType = resourceType.toLowerCase();
    const fullType = resourceTypeMap[normalizedType] ?? resourceType;

    return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
      // Type guard to ensure we have the expected structure
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid stack output structure: expected object, got ${typeof raw}`
        );
      }

      const root = raw as StackOutputs;
      const resource = root?.[domain]?.[fullType]?.[name];

      if (resource === undefined) {
        // `fullType` defaults to the service-account type when no `type` was
        // given; hint that a `{ type }` disambiguator may be required so the
        // generic no-type path does not look broken for non-SA resources.
        throw new Error(
          `Resource '${name}' of type '${fullType}' not found under domain ` +
            `'${domain}'. If '${name}' is not a service account, pass its type, ` +
            `e.g. get('${name}', { type: 'bucket' }).`
        );
      }

      return resource;
    });
  }

  /**
   * Resolves a resource in domain-optional mode by reading a flat `root[name]`
   * string value from the stack outputs and sniffing its email/member format.
   *
   * Merged from the former `ReferenceWithoutDomain`; behaviour is preserved
   * byte-for-byte (error messages, conversion rules).
   * @private
   */
  private resolveDomainOptional(name: string): pulumi.Output<ResourceOutput> {
    // Access stack outputs directly without any wrapper key.
    return this.stackRef.outputs.apply((raw: unknown) => {
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid stack output structure: expected object, got ${typeof raw}`
        );
      }

      const root = raw as Record<string, unknown>;
      const value = root[name];

      if (value === undefined) {
        const availableKeys = Object.keys(root);
        throw new Error(
          `Domain-optional resource '${name}' not found in stack '${this.stack}'. ` +
            `Available keys: [${availableKeys.join(', ')}]`
        );
      }

      if (typeof value !== 'string') {
        throw new Error(
          `Expected string value for '${name}' in stack '${this.stack}', got ${typeof value}`
        );
      }

      return CloudInfraReference.convertStringToResourceOutput(value);
    });
  }

  /**
   * Converts a string value (email or `serviceAccount:` member format) to a
   * `ResourceOutput`. Merged from the former `ReferenceWithoutDomain`.
   * @private
   */
  private static convertStringToResourceOutput(value: string): ResourceOutput {
    let email: string;
    let member: string;

    if (value.startsWith('serviceAccount:')) {
      member = value;
      email = value.replace('serviceAccount:', '');
    } else {
      email = value;
      member = `serviceAccount:${value}`;
    }

    return {
      email,
      member,
      id: email, // Use email as fallback ID
      name: email.split('@')[0], // Extract name part from email
    };
  }

  /**
   * Validates that a resource has the expected property
   * @param resource - The resource object to validate
   * @param property - The property name to check
   * @returns The property value
   * @throws An error if the property is missing
   * @private
   */
  private validateResourceProperty<T extends keyof ResourceOutput>(
    resource: ResourceOutput,
    property: T
  ): NonNullable<ResourceOutput[T]> {
    const value = resource[property];
    if (value === undefined || value === null) {
      throw new Error(
        `Property '${String(property)}' not found on fetched resource`
      );
    }
    return value as NonNullable<ResourceOutput[T]>;
  }

  /**
   * Generates a standardized identifier string for a resource, derived from the
   * referenced stack's name and the current context. This can be useful for
   * creating consistent names for dependent resources.
   *
   * The format is `{project}-{name}-{environment}-{domain}` (domain mode) or
   * `{project}-{name}-{environment}` (domain-optional mode). Frozen Contract F4
   * — the byte output must not drift.
   *
   * @param name - The name of the resource (e.g., "default-vpc").
   * @returns A formatted identifier string.
   */
  public getIdentifier(name: string): string {
    const stackParts = this.stack.split('/'); // org/project/env
    const proj = stackParts[1] ?? 'unkproj';
    const env = stackParts[2] ?? 'unkenv';
    if (this.domainOptional) {
      // Byte-identical to the former ReferenceWithoutDomain.getIdentifier (F4).
      return `${proj}-${name}-${env}`;
    }
    const { domain } = this.domain;
    return `${proj}-${name}-${env}-${domain}`;
  }

  /**
   * Resolves a cross-stack resource and returns a {@link ReferenceRecord} whose
   * fields are lazy `pulumi.Output<string>` values. This is the preferred,
   * intuitive read API.
   *
   * ```ts
   * const sa = ref.get("my-app");
   * sa.email; sa.id; sa.name; sa.member; sa.identifier;
   * ```
   *
   * `type` / `domain` are optional disambiguators — supply `type` when a name
   * exists under more than one resource type, and `domain` to override the
   * reference's configured domain for a single lookup. Each output field throws
   * a helpful error at apply time if the property is absent (preserving the
   * legacy `validateResourceProperty` behaviour). `identifier` is a
   * deterministic string (Frozen Contract F4).
   *
   * NOTE: when `type` is omitted, the lookup defaults to the service-account
   * type (`account`). A non-service-account resource therefore REQUIRES
   * `{ type }` — e.g. `get("archive", { type: "bucket" })`. On a
   * domain-optional reference (constructed without a `domain`), `type` and
   * `domain` are meaningless (outputs are flat strings) and passing `domain`
   * throws.
   *
   * @param name - The grouping key under which the resource was recorded.
   * @param options - Optional `{ type?, domain? }` disambiguators.
   * @returns A {@link ReferenceRecord} of lazy outputs plus `identifier`/`raw`.
   */
  public get(name: string, options?: ReferenceGetOptions): ReferenceRecord;
  /**
   * Legacy raw-output accessor.
   *
   * @deprecated Use `get(name, { type }).raw` (or a typed field such as
   *   `.id` / `.email`) instead. This two-argument string form returns the raw
   *   `pulumi.Output<ResourceOutput>`.
   * @param resourceType - The resource type alias or full Pulumi type.
   * @param name - The grouping key of the resource.
   */
  public get(resourceType: string, name: string): pulumi.Output<ResourceOutput>;
  public get(
    nameOrType: string,
    optionsOrName?: ReferenceGetOptions | string
  ): ReferenceRecord | pulumi.Output<ResourceOutput> {
    // Legacy two-string form: `get(resourceType, name)` → raw output.
    if (typeof optionsOrName === 'string') {
      return this.resolve(nameOrType, optionsOrName);
    }

    // New record form: `get(name, { type?, domain? })`.
    const name = nameOrType;
    const type = optionsOrName?.type ?? DEFAULT_RESOURCE_TYPE;
    const domainOverride = optionsOrName?.domain;
    return this.buildRecord(name, type, domainOverride);
  }

  /**
   * Builds a {@link ReferenceRecord} for the given name/type/domain. The output
   * fields are lazy: the stack output is only fetched when a field is consumed.
   * @private
   */
  private buildRecord(
    name: string,
    type: string,
    domainOverride?: string
  ): ReferenceRecord {
    // Capture a single resolver closure so `this` is not needed inside the
    // record's lazy getters.
    const resolveResource = (): pulumi.Output<ResourceOutput> =>
      this.resolve(type, name, domainOverride);

    const lazyField = (property: RecordField): pulumi.Output<string> =>
      resolveResource().apply(resource => {
        const value = resource[property];
        if (value === undefined || value === null) {
          throw new Error(`'${property}' not present on '${name}'`);
        }
        return value as string;
      });

    const identifier = this.getIdentifier(name);

    return {
      get id() {
        return lazyField('id');
      },
      get name() {
        return lazyField('name');
      },
      get email() {
        return lazyField('email');
      },
      get member() {
        return lazyField('member');
      },
      get projectId() {
        return lazyField('projectId');
      },
      get version() {
        return lazyField('version');
      },
      identifier,
      get raw() {
        return resolveResource();
      },
    };
  }

  /**
   * Returns every resource record from the referenced stack as a flat list of
   * `{ domain, type, name, record }` entries. Resolves lazily over the existing
   * nested wire. In domain-optional mode each flat string output becomes one
   * entry with `domain`/`type` set to `undefined`.
   *
   * @returns A `pulumi.Output` of all records in the referenced stack.
   */
  public all(): pulumi.Output<
    Array<{
      domain?: string;
      type?: string;
      name: string;
      record: ResourceOutput;
    }>
  > {
    if (this.domainOptional) {
      return this.stackRef.outputs.apply((raw: unknown) => {
        if (!raw || typeof raw !== 'object') {
          return [];
        }
        const root = raw as Record<string, unknown>;
        return Object.entries(root)
          .filter(([, value]) => typeof value === 'string')
          .map(([name, value]) => ({
            name,
            record: CloudInfraReference.convertStringToResourceOutput(
              value as string
            ),
          }));
      });
    }

    return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
      if (!raw || typeof raw !== 'object') {
        return [];
      }
      const root = raw as StackOutputs;
      const out: Array<{
        domain?: string;
        type?: string;
        name: string;
        record: ResourceOutput;
      }> = [];
      for (const [domain, types] of Object.entries(root)) {
        if (!types || typeof types !== 'object') continue;
        for (const [type, names] of Object.entries(types)) {
          if (!names || typeof names !== 'object') continue;
          for (const [name, record] of Object.entries(names)) {
            out.push({ domain, type, name, record: record as ResourceOutput });
          }
        }
      }
      return out;
    });
  }

  /**
   * Retrieves the `id` property of a specific resource from the referenced stack.
   *
   * @deprecated Use `get(name, { type }).id` instead.
   * @param resourceType - The resource's type alias (e.g., "bucket").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's unique ID.
   * @throws An error at runtime if the `id` property does not exist on the
   *   resolved resource object.
   */
  public getId(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'id') as string;
    });
  }

  /**
   * Retrieves the `name` property of a specific resource from the referenced stack.
   *
   * @deprecated Use `get(name, { type }).name` instead.
   * @param resourceType - The resource's type alias (e.g., "bucket").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's name.
   * @throws An error at runtime if the `name` property does not exist on the
   *   resolved resource object.
   */
  public getName(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'name') as string;
    });
  }

  /**
   * Retrieves the `email` property of a resource, typically a service account.
   *
   * @deprecated Use `get(name, { type }).email` instead.
   * @param resourceType - The resource's type alias (e.g., "sa").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's email address.
   * @throws An error at runtime if the `email` property does not exist on the
   *   resolved resource object.
   */
  public getEmail(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'email') as string;
    });
  }

  /**
   * Retrieves the `member` property of a resource, typically an IAM binding.
   *
   * @param resourceType - The resource's type alias.
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the resource's member identifier
   *   (e.g., "serviceAccount:my-sa@...").
   * @deprecated Use `get(name, { type }).member` instead.
   * @throws An error at runtime if the `member` property does not exist on the
   *   resolved resource object.
   */
  public getMember(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'member') as string;
    });
  }

  /**
   * Retrieves the `projectId` property of a specific resource from the
   * referenced stack.
   *
   * @deprecated Use `get(name, { type }).projectId` instead.
   * @param resourceType - The resource's type alias (e.g., "project").
   * @param name - The grouping key of the resource.
   * @returns A `pulumi.Output` containing the GCP project ID.
   * @throws An error at runtime if the `projectId` property does not exist on
   *   the resolved resource object.
   */
  public getProjectId(
    resourceType: string,
    name: string
  ): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'projectId') as string;
    });
  }

  /**
   * Retrieves the `version` property of a specific resource.
   * @deprecated Use `get(name, { type }).version` instead.
   */
  public getVersion(resourceType: string, name: string): pulumi.Output<string> {
    return this.resolve(resourceType, name).apply(resource => {
      return this.validateResourceProperty(resource, 'version') as string;
    });
  }
}
