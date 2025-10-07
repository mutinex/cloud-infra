/**
 * @module @mutinex/cloud-infra/core/output
 */
import * as pulumi from '@pulumi/pulumi';
import { CloudInfraMeta } from '../meta';

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
