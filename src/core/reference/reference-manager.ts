/**
 * @module @mutinex/cloud-infra/core/reference
 */
import * as pulumi from '@pulumi/pulumi';
import * as crypto from 'crypto';
import {
  getDefaultOutputKey,
  resourceTypeMap,
  getServiceAlias,
  getTypeForServiceAlias,
  FLAT_KEY_SEPARATOR,
  parseFlatKey,
} from './config';
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
   * When `true`, this reference resolves against the flat KEYED MAP emitted by
   * `CloudInfraOutput.getFlatOutputs()` (`Record<key, string>`, keyed
   * `<domain>.<service>[.<region>].<name>.<field>`) instead of the nested
   * `root[domain][type][name]` wire. Set via the `flat` option. The reader
   * re-assembles a record by grouping keys that share a prefix. Independent of
   * {@link domainOptional} (which reads flat top-level STRINGS by name, not the
   * grammar-keyed map). When flat mode is on, `domainOptional` is forced off so
   * a `domain` may still scope/disambiguate flat records.
   * @private
   */
  private readonly flat: boolean;

  /**
   * Caches `pulumi.StackReference` instances to avoid creating duplicates for
   * the same stack within a single Pulumi program. The cache key is the
   * fully-qualified stack name.
   *
   * A plain unbounded `Map` (no eviction): a real Pulumi program references a
   * handful of stacks, so the entry count is tiny and bounded by the program
   * itself. The former hand-rolled LRU added no value here.
   * @private
   */
  private static stackRefCache = new Map<string, pulumi.StackReference>();

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
      return cached;
    }

    const safeName = this.generateSafeName(stack);
    const ref = new pulumi.StackReference(safeName, { name: stack });

    this.stackRefCache.set(stack, ref);

    return ref;
  }

  /**
   * Clears the entire stack reference cache. Useful for testing or
   * when you need to force fresh references.
   * @public
   */
  public static clearCache(): void {
    this.stackRefCache.clear();
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
    let flat = false;

    if (typeof stackOrConfig === 'string') {
      stack = stackOrConfig;
      domain = options?.domain;
      outputKey = options?.outputKey;
      flat = options?.flat ?? false;
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
    this.flat = flat;
    // Flat mode reads the grammar-keyed flat MAP wire, NOT the flat-string
    // `root[name]` wire — so it is never domain-optional even when
    // `domain` is omitted (a missing domain just means "do not scope by domain").
    this.domainOptional = !flat && domain === undefined;
    // The nested wire and the flat-record wire both live under an output key
    // (so consult the Pulumi config fallback); only domain-optional mode reads
    // `stackRef.outputs` directly and never touches the output key.
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
   *   alias (e.g., "bucket") or the full Pulumi type name. When `undefined`,
   *   the name is resolved by a CROSS-TYPE SCAN across every type under the
   *   resolved domain (throws on a multi-type collision).
   * @param name - The grouping key under which the resource was recorded in the
   *   source stack.
   * @returns A `pulumi.Output` that resolves to the raw resource object.
   * @throws An error if the resource cannot be found in the outputs.
   * @private
   */
  private resolve(
    resourceType: string | undefined,
    name: string,
    domainOverride?: string
  ): pulumi.Output<ResourceOutput> {
    // Domain-optional mode is an INSTANCE INVARIANT fixed at construction: it
    // reads a fundamentally different (flat) wire, so a per-call `domain`/`type`
    // can never flip the resolution strategy. Reject a domain override rather
    // than silently switching wire formats. There is no type dimension here.
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

    // Flat mode (Move 4): resolve against the self-describing record array.
    if (this.flat) {
      return this.resolveFlat(resourceType, name, domainOverride);
    }

    const domain = domainOverride ?? this.domain.domain;

    return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
      // Type guard to ensure we have the expected structure
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid stack output structure: expected object, got ${typeof raw}`
        );
      }

      const root = raw as StackOutputs;
      const typesUnderDomain = root?.[domain] ?? {};

      // Explicit type: look up exactly that type (existing behaviour).
      if (resourceType !== undefined) {
        const normalizedType = resourceType.toLowerCase();
        const fullType = resourceTypeMap[normalizedType] ?? resourceType;
        const resource = typesUnderDomain?.[fullType]?.[name];

        if (resource === undefined) {
          throw new Error(
            `Resource '${name}' of type '${fullType}' not found under domain '${domain}'.`
          );
        }
        return resource;
      }

      // No type given: scan every type under the domain for the name.
      const matches: Array<{ type: string; resource: ResourceOutput }> = [];
      for (const [type, names] of Object.entries(typesUnderDomain)) {
        if (!names || typeof names !== 'object') continue;
        const resource = (names as Record<string, ResourceOutput>)[name];
        if (resource !== undefined) {
          matches.push({ type, resource });
        }
      }

      // Echo a real candidate type (the full Pulumi type resolves via the
      // `resourceTypeMap[...] ?? resourceType` fall-through) so the hint is
      // copy-pasteable rather than a `<type>` placeholder.
      return CloudInfraReference.selectUniqueMatch(matches, {
        name,
        notFound: `Resource '${name}' not found under domain '${domain}'.`,
        ambiguous: candidates =>
          `Resource '${name}' is ambiguous under domain '${domain}': it ` +
          `exists under multiple types [${candidates}]. Disambiguate ` +
          `with a type, e.g. get('${name}', { type: '${matches[0].type}' }).`,
        candidate: m => m.type,
      });
    });
  }

  /**
   * Selects the single match from a cross-scan, or throws the not-found /
   * ambiguity error. Shared by the nested cross-type scan ({@link resolve}) and
   * the flat cross-record scan ({@link resolveFlat}) so the three-outcome
   * contract (zero → not-found, one → return, many → ambiguity) cannot drift
   * between the two wires. Each caller supplies its own (byte-stable) message
   * strings and candidate formatter.
   * @private
   */
  private static selectUniqueMatch<
    M extends { resource: ResourceOutput },
  >(
    matches: M[],
    messages: {
      name: string;
      notFound: string;
      ambiguous: (candidates: string) => string;
      candidate: (m: M) => string;
    }
  ): ResourceOutput {
    if (matches.length === 0) {
      throw new Error(messages.notFound);
    }
    if (matches.length > 1) {
      const candidates = matches.map(messages.candidate).join(', ');
      throw new Error(messages.ambiguous(candidates));
    }
    return matches[0].resource;
  }

  /**
   * Resolves a resource in FLAT mode by re-assembling a {@link ResourceOutput}
   * from the flat KEYED MAP emitted by `CloudInfraOutput.getFlatOutputs()`.
   *
   * The map's keys are `<domain>.<service>[.<region>].<name>.<field>`. This
   * reader groups every key sharing the same
   * `<domain>.<service>[.<region>].<name>` prefix into one record, collecting
   * each `.<field>` entry as a property. Matching mirrors the nested
   * cross-type-scan semantics: keys are grouped, then filtered by `name`, and
   * optionally narrowed by `type` (resolved through `getServiceAlias`/the
   * `resourceTypeMap` alias table → a service segment) and by `domain` (the
   * configured domain or a per-lookup override; an empty configured domain
   * means "any domain"). Exactly one surviving group is returned; multiple
   * groups throw an ambiguity error; zero groups throw not-found.
   * @private
   */
  private resolveFlat(
    type: string | undefined,
    name: string,
    domainOverride?: string
  ): pulumi.Output<ResourceOutput> {
    const domainFilter = domainOverride ?? this.domain.domain;
    // The caller's `type` (alias or full Pulumi type) → the SERVICE segment the
    // producer used. `getServiceAlias` is keyed by full type, so resolve an
    // alias through `resourceTypeMap` first, then map type → service.
    const serviceFilter =
      type !== undefined
        ? getServiceAlias(resourceTypeMap[type.toLowerCase()] ?? type)
        : undefined;

    return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(
          `Invalid flat stack output structure: expected a keyed object, got ` +
            `${Array.isArray(raw) ? 'array' : typeof raw}. Did the source stack ` +
            `export 'CloudInfraOutput.getFlatOutputs()'?`
        );
      }

      const groups = CloudInfraReference.groupFlatMap(
        raw as Record<string, unknown>
      );

      const matches = groups.filter(g => {
        if (g.name !== name) return false;
        if (serviceFilter !== undefined && g.service !== serviceFilter) {
          return false;
        }
        // Empty configured domain (and no override) => do not scope by domain.
        if (domainFilter !== '' && g.domain !== domainFilter) {
          return false;
        }
        return true;
      });

      const domainHint =
        domainFilter !== '' ? ` under domain '${domainFilter}'` : '';

      const match = CloudInfraReference.selectUniqueMatch(
        matches.map(g => ({ group: g, resource: g.record })),
        {
          name,
          notFound: `Resource '${name}' not found in flat outputs${domainHint}.`,
          ambiguous: candidates =>
            `Resource '${name}' is ambiguous${domainHint} in flat outputs: it ` +
            `matches multiple records [${candidates}]. Disambiguate with a ` +
            `type, e.g. get('${name}', { type: '${matches[0].service}' }).`,
          candidate: m =>
            `{ service: '${m.group.service}', domain: '${m.group.domain}' }`,
        }
      );

      return match;
    });
  }

  /**
   * Parses the flat KEYED MAP back into grouped records. Each key is
   * `<domain>.<service>[.<region>].<name>.<field>`; keys sharing the leading
   * `<domain>.<service>[.<region>].<name>` are merged into a single record with
   * one property per `<field>`.
   *
   * Parsing is positional from BOTH ends so it tolerates neither dots in the
   * `name`/`service` nor an unknown region: segment[0] is the domain, the LAST
   * segment is the field, the SECOND-TO-LAST is the name, segment[1] is the
   * service, and a 5-segment key carries the region at segment[2] (a 4-segment
   * key has no region). Malformed keys (< 4 segments) are skipped.
   * @private
   */
  private static groupFlatMap(map: Record<string, unknown>): Array<{
    domain: string;
    service: string;
    region?: string;
    name: string;
    record: ResourceOutput;
  }> {
    const byPrefix = new Map<
      string,
      {
        domain: string;
        service: string;
        region?: string;
        name: string;
        record: Record<string, unknown>;
      }
    >();

    for (const [key, value] of Object.entries(map)) {
      // Parse via the shared grammar — the single place a flat key is split.
      // Malformed (wrong-arity) keys parse to `undefined` and are skipped.
      const parsed = parseFlatKey(key);
      if (parsed === undefined) continue;
      const { domain, service, region, name, field } = parsed;

      // Group by the addressing prefix (everything before `<field>`): the key
      // with its final `.<field>` segment removed. Derive it positionally from
      // the SAME split the grammar used, so the read path stays a pure
      // re-grouping (no validation/throw on already-emitted wire data).
      const lastSep = key.lastIndexOf(FLAT_KEY_SEPARATOR);
      const prefix = key.slice(0, lastSep);
      let group = byPrefix.get(prefix);
      if (!group) {
        group = { domain, service, region, name, record: {} };
        byPrefix.set(prefix, group);
      }
      group.record[field] = value;
    }

    return Array.from(byPrefix.values()).map(g => ({
      domain: g.domain,
      service: g.service,
      region: g.region,
      name: g.name,
      record: g.record as ResourceOutput,
    }));
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
    const { domain } = this.domain;
    // F4: emit the domain-suffixed form only when a domain segment is actually
    // present. Two domain-less cases collapse to the ReferenceWithoutDomain
    // form (`${proj}-${name}-${env}`):
    //   - domain-optional mode (never has a domain), and
    //   - flat mode constructed WITHOUT a domain (else a dangling trailing `-`).
    // The empty-string check is SCOPED to flat mode so the legacy NESTED path
    // is byte-unchanged: a nested reference built with an explicit `domain: ''`
    // keeps its historical `${proj}-${name}-${env}-` output (F4 frozen). Nested
    // references in practice always carry a non-empty domain.
    if (this.domainOptional || (this.flat && domain === '')) {
      // Byte-identical to the former ReferenceWithoutDomain.getIdentifier (F4).
      return `${proj}-${name}-${env}`;
    }
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
   * `type` / `domain` are optional disambiguators — supply `type` only when a
   * name exists under more than one resource type, and `domain` to override the
   * reference's configured domain for a single lookup. Each output field throws
   * a helpful error at apply time if the property is absent (preserving the
   * legacy `validateResourceProperty` behaviour). `identifier` is a
   * deterministic string (Frozen Contract F4).
   *
   * Resolution: when `type` is omitted, the name is resolved by a CROSS-TYPE
   * SCAN across every resource type under the resolved domain — exactly one
   * match returns it; a name shared by multiple types throws, listing the
   * candidate types and asking for `{ type }`; no match throws not-found. On a
   * domain-optional reference (constructed without a `domain`), there is no
   * type dimension: `root[name]` is read directly, and passing `domain` throws.
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

    // New record form: `get(name, { type?, domain? })`. An omitted `type`
    // triggers a cross-type scan in `resolve`.
    const name = nameOrType;
    const type = optionsOrName?.type;
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
    type: string | undefined,
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
   * `type` carries the FULL Pulumi type in BOTH the nested and the flat wire
   * (cross-mode parity): the nested wire stores it directly, and flat mode
   * reverse-maps the key's short `<service>` segment back to its full type via
   * the unambiguous alias table. Flat mode ADDITIONALLY exposes the short
   * service alias under `service` (the nested wire has no service alias, so the
   * field is absent there).
   *
   * @returns A `pulumi.Output` of all records in the referenced stack.
   */
  public all(): pulumi.Output<
    Array<{
      domain?: string;
      type?: string;
      service?: string;
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

    // Flat mode: re-assemble every grouped record from the keyed map. The flat
    // key carries only the short `<service>` alias, so reverse-map it back to
    // the FULL Pulumi type for `type` (matching the nested wire); when the alias
    // has no explicit mapping (a derived fallback), `type` falls back to the
    // alias itself so the field is never empty. The short alias is also exposed
    // under `service`.
    if (this.flat) {
      return this.stackRef.getOutput(this.outputKey).apply((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return [];
        }
        return CloudInfraReference.groupFlatMap(
          raw as Record<string, unknown>
        ).map(g => ({
          domain: g.domain,
          type: getTypeForServiceAlias(g.service) ?? g.service,
          service: g.service,
          name: g.name,
          record: g.record,
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
