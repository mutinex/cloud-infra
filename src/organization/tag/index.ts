import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';
import { ValidationError, ResourceError } from '../../core/errors';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { gcpConfig } from '../../config';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraComponent } from '../../core/component';

/** Pulumi type token for the Tag component. */
export const TAG_TYPE = 'cloud-infra:tag:CloudInfraTag';

export type CloudInfraTagConfig = Omit<
  gcp.tags.TagKeyArgs,
  'parent' | 'shortName'
> & {
  parent?: pulumi.Input<string>;
  values: { shortName: string; description: string }[];
};

export const TagConfigSchema = z
  .object({
    values: z.array(
      z.object({
        shortName: z.string(),
        description: z.string(),
      })
    ),
  })
  .passthrough();

export class CloudInfraTag extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly inputName: string;
  private readonly gcpTagKey: gcp.tags.TagKey;
  private readonly tagValues: {
    resource: gcp.tags.TagValue;
    shortName: string;
  }[] = [];

  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraTagConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    const resourceNameForSuper = meta.getName();
    super(
      TAG_TYPE,
      resourceNameForSuper,
      resourceNameForSuper,
      { domain: meta.getDomain() },
      opts
    );

    try {
      CloudInfraLogger.info('Initializing GCP Tag Key and Values', {
        component: 'tag',
        operation: 'constructor',
      });

      TagConfigSchema.parse(config);
      const values = config.values;
      const resourceName = meta.getName();
      const candidateInputName = meta.getInputName();
      if (Array.isArray(candidateInputName)) {
        throw new ValidationError(
          'CloudInfraTag expects a single name.',
          'tag',
          'constructor'
        );
      }
      this.inputName = candidateInputName;
      this.meta = meta;

      this.gcpTagKey = this.createTagKey(config, resourceName, this.inputName);

      CloudInfraLogger.info('Creating tag values for tag key', {
        component: 'tag',
        operation: 'createTagValues',
      });

      for (const value of values) {
        const tagValueResource = this.createTagValue(
          this.gcpTagKey.name,
          value
        );
        this.tagValues.push({
          resource: tagValueResource,
          shortName: value.shortName,
        });
      }

      this.registerOutputs({
        tagKey: this.gcpTagKey,
        tagValues: this.tagValues.map(v => v.resource),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid Tag Config: ${err.message}`,
          'tag',
          'validation'
        );
      }
      throw new ResourceError(
        `Failed to create Tags ${meta.getName()}: ${err}`,
        'tag',
        'creation'
      );
    }
  }

  private createTagKey(
    config: CloudInfraTagConfig,
    resourceName: string,
    keyShortName: string
  ): gcp.tags.TagKey {
    const { parent, description } = config;

    // v1: root-level (no parent) → alias back to root for IN-PLACE migration.
    // gcp.tags.TagKey has NO labels → plain opts (not childOpts).
    return new gcp.tags.TagKey(
      resourceName,
      {
        parent: parent ?? gcpConfig.organization,
        shortName: keyShortName,
        description,
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    );
  }

  private createTagValue(
    parent: pulumi.Input<string>,
    value: { shortName: string; description: string }
  ): gcp.tags.TagValue {
    const { shortName, description } = value;

    const formattedParent = pulumi.interpolate`tagKeys/${parent}`;

    // F1/F2: first-arg logical name stays the RAW `shortName` (NOT meta-derived).
    // v1: root-level (no parent) → alias back to root for IN-PLACE migration.
    // gcp.tags.TagValue has NO labels → plain opts (not childOpts).
    return new gcp.tags.TagValue(
      shortName,
      {
        parent: formattedParent,
        shortName,
        description,
      },
      {
        parent: this,
        aliases: [{ parent: pulumi.rootStackResource }],
      }
    );
  }

  public exportOutputs(manager: CloudInfraOutput): void {
    const keyGrouping = this.inputName;

    manager.record('gcp:tags:TagKey', keyGrouping, this.meta, this.gcpTagKey);

    for (const tagValueInstance of this.tagValues) {
      const valueResource = tagValueInstance.resource;
      const valueGrouping = tagValueInstance.shortName;
      manager.record(
        'gcp:tags:TagValue',
        valueGrouping,
        this.meta,
        valueResource
      );
    }
  }
}
