import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as z from 'zod';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { PulumiInputStringSchema } from '../../core/types';
import { gcpConfig } from '../../config';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import { CloudInfraComponent } from '../../core/component';

/** Pulumi type token for the Folder component. */
export const FOLDER_TYPE = 'cloud-infra:folder:CloudInfraFolder';

export const CloudInfraFolderExtrasSchema = z
  .object({
    cloudInfraTags: z.array(PulumiInputStringSchema).optional(),
  })
  .passthrough();

export type CloudInfraFolderExtras = z.infer<
  typeof CloudInfraFolderExtrasSchema
>;

export type CloudInfraFolderConfig = Omit<
  gcp.organizations.FolderArgs,
  'parent' | 'displayName'
> & {
  parent?: pulumi.Input<string>;
  cloudInfraTags?: pulumi.Input<string>[];
};

export class CloudInfraFolder extends CloudInfraComponent {
  private meta: CloudInfraMeta;
  private folder: gcp.organizations.Folder;
  private tagBindings: gcp.tags.TagBinding[] = [];
  private readonly inputName: string;

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraFolderConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    const resourceName = meta.getName();

    super(
      FOLDER_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing folder component', {
      component: 'folder',
      operation: 'constructor',
    });

    this.meta = meta;

    // Validate single-name usage.
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraFolder expects `meta.name` to be a single string. Use an array-aware component for bulk folder creation.',
        'folder',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    const extras = CloudInfraFolderExtrasSchema.parse(cloudInfraConfig);
    const { cloudInfraTags } = extras;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cloudInfraTags: _, ...folderArgsRaw } = cloudInfraConfig;

    const componentName = meta.getName();

    if (componentName.length > 30) {
      throw new ValidationError(
        `Folder displayName '${componentName}' is too long (${componentName.length} chars). Must be at most 30 characters.`,
        'folder',
        'constructor'
      );
    }

    const folderArgs: gcp.organizations.FolderArgs = {
      parent: folderArgsRaw.parent ?? gcpConfig.organization,
      displayName: componentName,
      deletionProtection: folderArgsRaw.deletionProtection ?? true,
      ...folderArgsRaw,
    };

    const protectFlag =
      folderArgsRaw.deletionProtection === false ? false : true;

    // v1: root-level (no parent) → alias back to root for IN-PLACE migration.
    // gcp.organizations.Folder has NO labels → plain opts (not childOpts).
    // Preserve protect + replaceOnChanges exactly.
    this.folder = new gcp.organizations.Folder(componentName, folderArgs, {
      protect: protectFlag,
      replaceOnChanges: ['parent'],
      parent: this,
      aliases: [{ parent: pulumi.rootStackResource }],
    });

    if (cloudInfraTags) {
      (cloudInfraTags || []).forEach(tagValueInput => {
        pulumi.output(tagValueInput).apply((actualTagValueId: string) => {
          const key = actualTagValueId.split('/').pop() || 'tag';
          const resName = `${componentName}:FolderTagBinding:${key}`.substring(
            0,
            100
          );
          const tagBinding = new gcp.tags.TagBinding(
            resName,
            {
              parent: pulumi.interpolate`//cloudresourcemanager.googleapis.com/${this.folder.id}`,
              tagValue: actualTagValueId,
            },
            { deleteBeforeReplace: true, parent: this.folder }
          );
          this.tagBindings.push(tagBinding);
        });
      });
    }

    this.registerOutputs({
      folder: this.folder,
    });
  }

  public getFolder(): gcp.organizations.Folder {
    return this.folder;
  }
  public getTagBindings(): gcp.tags.TagBinding[] {
    return this.tagBindings;
  }
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:organizations:Folder',
      grouping,
      this.meta,
      this.folder
    );
  }
}
