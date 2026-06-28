/**
 * @module @mutinex/cloud-infra/core/output
 */
import * as pulumi from '@pulumi/pulumi';
import { CloudInfraMeta } from '../meta';
import {
  getServiceAlias,
  deriveRegionSegment,
  composeFlatKey,
  composeFlatKeyPrefix,
} from '../flat-key-grammar';

/**
 * Defines the structure for a resource entry that can be recorded by the
 * {@link CloudInfraOutput}.
 *
 * This interface specifies a set of common fields for cloud resources that are
 * useful to export as structured output. Any Pulumi resource that provides these
 * properties can be recorded. All properties are optional except `id` and `name`,
 * which are universally available on Pulumi custom resources.
 */
export interface OutputResourceEntry {
  /**
   * The unique ID of the resource, automatically assigned by the provider.
   */
  id: pulumi.Output<string>;

  /**
   * The name of the resource, as assigned in the Pulumi program.
   * Optional since some resources like ServiceIdentity don't have a name property.
   */
  name?: pulumi.Output<string>;

  /**
   * The unique identifier of a role, typically associated with IAM resources.
   */
  roleId?: pulumi.Output<string>;

  /**
   * The email address associated with a resource, such as a service account.
   */
  email?: pulumi.Output<string>;

  /**
   * The physical location of the resource (e.g., a GCP region or zone).
   */
  location?: pulumi.Output<string>;

  /**
   * An identifier for a member in an IAM binding (e.g., 'user:jane@example.com').
   */
  member?: pulumi.Output<string>;

  /**
   * A uniform resource identifier for the resource, such as a Cloud Run service URL.
   */
  uri?: pulumi.Output<string>;

  /**
   * The ID of the GCP project where the resource is located.
   */
  projectId?: pulumi.Output<string>;

  /**
   * The IP address of a resource, such as a reserved static IP.
   */
  address?: pulumi.Output<string>;

  /**
   * The number of a resource, such as a project number.
   */
  number?: pulumi.Output<string>;

  /**
   * The version of the resource, such as a secret version.
   */
  version?: pulumi.Output<string>;

  /**
   * The URLs of the resource, such as a Cloud Run service URL.
   */
  urls?: pulumi.Output<string[]>;

  /**
   * Custom placement configuration, often used for regional settings in services
   * like Spanner.
   */
  customPlacementConfig?: pulumi.Output<
    { dataLocations: string[] } | undefined
  >;
}

/**
 * Represents a Pulumi {@link pulumi.CustomResource} that is compatible with the
 * {@link CloudInfraOutput}.
 *
 * This type combines Pulumi's base `CustomResource` with the
 * {@link OutputResourceEntry} interface, ensuring that any resource passed to
 * the manager has the required `id` and `name` properties, along with any of the
 * optional fields.
 */
export type OutputResource = pulumi.CustomResource & OutputResourceEntry;

/**
 * The SCALAR string fields of {@link OutputResourceEntry} that are emitted as
 * individual top-level keys in the flat KEYED MAP. NON-scalar fields (`urls`
 * array, `customPlacementConfig` object) are intentionally EXCLUDED — they
 * cannot become a single `pulumi.Output<string>` and remain available only on
 * the nested {@link CloudInfraOutput.getOutputs} wire.
 *
 * Order is deterministic (it fixes iteration order when composing keys).
 */
const FLAT_SCALAR_FIELDS = [
  'id',
  'name',
  'roleId',
  'email',
  'location',
  'member',
  'uri',
  'projectId',
  'address',
  'number',
  'version',
] as const satisfies readonly (keyof OutputResourceEntry)[];

/**
 * Manages structured output recording for Pulumi resources.
 *
 * This class provides a standardized way to collect and export details about
 * the resources created in a Pulumi program. It organizes outputs into a
 * nested structure based on a version, domain, resource type, and a
 * user-defined grouping key. This makes it easy to consume and reference
 * downstream, for example, in other Pulumi stacks or in external scripts.
 *
 * @example
 * ```ts
 * import { CloudInfraOutput } from "@mutinex/cloud-infra/core/output";
 * import { CloudInfraMeta } from "@mutinex/cloud-infra/core/meta";
 * import * as gcp from "@pulumi/gcp";
 *
 * // Create a new output manager
 * const outputManager = new CloudInfraOutput();
 *
 * // Define metadata for the resource
 * const meta = new CloudInfraMeta({ name: "my-bucket", domain: "au" });
 *
 * // Create a resource
 * const bucket = new gcp.storage.Bucket(meta.getName(), {
 *   location: meta.getLocation(),
 * });
 *
 * // Record the resource output
 * outputManager.record("storage-bucket", "primary", meta, bucket);
 *
 * // Export the collected outputs
 * export const myOutputs = outputManager.getOutputs();
 * ```
 */
export class CloudInfraOutput {
  private readonly data: Record<
    string,
    Record<string, Record<string, OutputResourceEntry>>
  > = {};

  /**
   * The parallel FLAT emission: a single-level KEYED MAP from a composed key
   * (`<domain>.<service>[.<region>].<name>.<field>`) to one scalar
   * `pulumi.Output<string>`. Built incrementally on every {@link record} call
   * in addition to the nested {@link data} map. Additive — never replaces the
   * nested format. Each composed key is UNIQUE: a duplicate key throws at
   * {@link record} time (see {@link record}).
   * @private
   */
  private readonly flat: Record<string, pulumi.Output<string>> = {};

  /**
   * Tracks which recorded resource OWNS each flat-key PREFIX
   * (`<domain>.<service>[.<region>].<name>`). The owner identity is the
   * `(resourceType, groupingKey)` pair that produced the prefix.
   *
   * The per-key collision guard ({@link flat}) only fires when two resources
   * collide on the SAME `prefix.field`. Two DIFFERENT resources that compose an
   * identical prefix but emit DISJOINT field sets would each pass that guard and
   * then silently MERGE into one fabricated record on the consumer side (which
   * groups by prefix). This map closes that gap: the first writer of a prefix
   * claims it, and any later write under the same prefix by a different
   * `(resourceType, groupingKey)` THROWS.
   * @private
   */
  private readonly flatPrefixOwners = new Map<
    string,
    { resourceType: string; groupingKey: string }
  >();

  /**
   * Creates a new instance of the `CloudInfraOutput`.
   *
   * No parameters are required. All recorded resources are stored directly
   * under their domain, without an additional top-level key.
   */
  constructor() {}

  /**
   * Records the details of a Pulumi resource in the structured output data.
   *
   * This is the primary method for adding resources to the output collection.
   * It stores the resource's key properties in a nested map, organized for
   * easy retrieval.
   *
   * @param resourceType - A string that categorizes the resource (e.g., "project",
   * "bucket", "service-account"). This will be used as a key in the output object.
   * @param groupingKey - A user-defined key to group multiple resources of the same
   * type. For example, "primary" or "logs".
   * @param meta - The {@link CloudInfraMeta} instance used to create the resource, which
   * provides the domain for structuring the output.
   * @param resource - The Pulumi resource to record. It must be compatible with
   * the {@link OutputResource} type.
   */
  public record(
    resourceType: string,
    groupingKey: string,
    meta: CloudInfraMeta,
    resource: OutputResource
  ): void {
    const domain = meta.getDomain();
    this.ensurePath(domain, resourceType);

    const entry = this.buildResourceEntry(resource);
    this.data[domain][resourceType][groupingKey] = entry;

    // DUAL-EMIT: project the same entry into the flat KEYED MAP — one key per
    // SCALAR field, keyed `<domain>.<service>[.<region>].<name>.<field>`. The
    // region segment is present iff the entry carries a `location` field.
    this.emitFlat(domain, resourceType, groupingKey, meta, entry);
  }

  /**
   * Projects one recorded entry into the flat KEYED MAP: one key per scalar
   * field present on the entry. Throws on a composed-key collision.
   * @private
   */
  private emitFlat(
    domain: string,
    resourceType: string,
    groupingKey: string,
    meta: CloudInfraMeta,
    entry: OutputResourceEntry
  ): void {
    const service = getServiceAlias(resourceType);

    // The region segment is present iff the entry carries a `location` field
    // (regional resources). Global resources (SA, folder, project, WIP, …) do
    // not set `location`, so the segment is omitted.
    // A typed read-only view of the entry's fields. Every scalar field is a
    // `pulumi.Output<string>`; the non-scalar fields (`urls`, `customPlacementConfig`)
    // are never read here (they are not in FLAT_SCALAR_FIELDS). Typing the
    // accessor as `Output<unknown>` lets us coerce conditionally without the
    // former `entry as unknown as Record<string, unknown>` double-cast.
    const entryFields = entry as {
      [K in keyof OutputResourceEntry]?: pulumi.Output<unknown>;
    } & { location?: pulumi.Output<unknown> };
    const hasLocation = entryFields.location !== undefined;
    const regionSegment = hasLocation ? deriveRegionSegment(meta) : undefined;

    // Compose (and validate) the addressing PREFIX via the shared grammar — the
    // single place addressing parts become a string. The grammar enforces the
    // SAFE-segment charset (rejecting a separator/whitespace/unicode in a
    // `name`/`region`) so an un-parseable key can never be emitted.
    const address = {
      domain,
      service,
      region: regionSegment,
      name: groupingKey,
    };
    const prefix = composeFlatKeyPrefix(address);

    // PREFIX OWNERSHIP: the per-key collision guard below only catches two
    // resources colliding on the same `prefix.field`. Two DIFFERENT resources
    // composing the same prefix with DISJOINT field sets would each pass that
    // guard yet silently merge into ONE record on read (the consumer groups by
    // prefix). Track the owning `(resourceType, groupingKey)` of each prefix and
    // reject any write under a prefix already owned by a different resource.
    const owner = this.flatPrefixOwners.get(prefix);
    if (
      owner !== undefined &&
      (owner.resourceType !== resourceType || owner.groupingKey !== groupingKey)
    ) {
      throw new Error(
        `Flat-output prefix collision: the prefix '${prefix}' is already owned ` +
          `by a different recorded resource ` +
          `(resourceType '${owner.resourceType}', grouping key ` +
          `'${owner.groupingKey}'); it cannot also be written by ` +
          `(resourceType '${resourceType}', grouping key '${groupingKey}'). Two ` +
          `distinct resources compose the same ` +
          `'<domain>.<service>[.<region>].<name>' prefix and would silently ` +
          `merge into one fabricated record on read. Disambiguate by giving ` +
          `them distinct grouping keys (or domains/regions).`
      );
    }
    this.flatPrefixOwners.set(prefix, { resourceType, groupingKey });

    for (const field of FLAT_SCALAR_FIELDS) {
      const value = entryFields[field];
      if (value === undefined) {
        continue;
      }
      const key = composeFlatKey(address, field);
      if (Object.prototype.hasOwnProperty.call(this.flat, key)) {
        throw new Error(
          `Flat-output key collision: '${key}' is produced by more than one ` +
            `recorded resource. Two records compose the same ` +
            `'<domain>.<service>[.<region>].<name>.<field>' key. Disambiguate ` +
            `by giving them distinct grouping keys (or domains/regions).`
        );
      }
      // CONDITIONAL coercion: only the `number` field (e.g. a project number)
      // carries a non-string runtime value, so coerce JUST that one to a string
      // Output while staying lazy. Every other scalar is already
      // `Output<string>` and is assigned by reference — no needless `.apply`.
      this.flat[key] =
        field === 'number'
          ? value.apply(v => String(v))
          : (value as pulumi.Output<string>);
    }
  }

  /**
   * Retrieves all recorded outputs for the current output schema version.
   *
   * @returns An object containing the structured output data, organized by
   * domain, resource type, and grouping key.
   */
  public getOutputs(): Record<
    string,
    Record<string, Record<string, OutputResourceEntry>>
  > {
    // Return the recorded data directly. Call sites can choose any variable
    // name when exporting without affecting the structure.
    return this.data;
  }

  /**
   * Retrieves all recorded outputs as a FLAT, single-level KEYED MAP — one key
   * per scalar field, keyed `<domain>.<service>[.<region>].<name>.<field>`
   * (separator `.`), mapping to one `pulumi.Output<string>`.
   *
   * This is the recommended wire, produced alongside (not instead of)
   * {@link getOutputs}. Because every key is a top-level scalar, a producer can
   * spread the map onto its module exports so each composed key becomes a
   * TOP-LEVEL stack output readable by a plain
   * `pulumi.StackReference.requireOutput("<key>")` in ONE hop:
   *
   * ```ts
   * // Each composed key becomes its own top-level stack output:
   * Object.assign(exports, mgr.getFlatOutputs());
   * // …or expose the whole map under a single nested output:
   * export const cloudInfra = mgr.getFlatOutputs();
   * export const org = mgr.getOutputs(); // legacy nested wire (unchanged)
   * ```
   *
   * @returns A `Record<string, pulumi.Output<string>>` keyed by composed key.
   */
  public getFlatOutputs(): Record<string, pulumi.Output<string>> {
    return this.flat;
  }

  /**
   * Ensures that the nested object structure exists for a given domain and
   * resource type before attempting to record an entry.
   *
   * If the path `[domain][resourceType]` does not exist in the data, it will be
   * created.
   *
   * @param domain - The domain name (e.g., "au", "us").
   * @param resourceType - The type of the resource (e.g., "project").
   * @private
   */
  private ensurePath(domain: string, resourceType: string): void {
    if (!this.data[domain]) {
      this.data[domain] = {};
    }
    if (!this.data[domain][resourceType]) {
      this.data[domain][resourceType] = {};
    }
  }

  /**
   * Constructs a clean resource entry object from a Pulumi resource.
   *
   * This method iterates through the fields defined in {@link OutputResourceEntry}
   * and includes only those that are present on the provided resource. This
   * prevents `undefined` values from cluttering the final output. The `id` and
   * `name` fields are always included.
   *
   * @param resource - The Pulumi resource to process.
   * @returns A new object containing only the defined properties from the resource.
   * @private
   */
  private buildResourceEntry(resource: OutputResource): OutputResourceEntry {
    const entry: Partial<OutputResourceEntry> = {
      id: resource.id,
    };

    // Add name if it exists (some resources like ServiceIdentity might not have it)
    if (resource.name !== undefined) {
      entry.name = resource.name;
    }

    // Add optional fields only if they are defined
    const optionalFields: (keyof OutputResourceEntry)[] = [
      'roleId',
      'email',
      'location',
      'member',
      'uri',
      'projectId',
      'address',
      'customPlacementConfig',
      'number',
      'version',
      'urls',
    ];

    for (const field of optionalFields) {
      if (resource[field] !== undefined) {
        (entry as Record<string, unknown>)[field] = resource[field];
      }
    }

    return entry as OutputResourceEntry;
  }
}
