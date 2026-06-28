import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as z from 'zod';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { PulumiInputStringSchema } from '../../core/types';
import { gcpConfig } from '../../config';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

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

/**
 * Name-first construction args for `CloudInfraFolder` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the folder config
 * ({@link CloudInfraFolderConfig}) into a single args object. The naming fields
 * are resolved into a `CloudInfraMeta` internally (identical `generateName`
 * output, Frozen Contract F1); the remaining fields are passed straight through
 * as the folder config exactly as the meta-first path.
 */
export type CloudInfraFolderArgs = NamingArgs & CloudInfraFolderConfig;

export class CloudInfraFolder extends CloudInfraComponent {
  private meta: CloudInfraMeta;
  private folder: gcp.organizations.Folder;
  private tagBindings: gcp.tags.TagBinding[] = [];
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the folder config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraFolderArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraFolder(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   * @param meta - CloudInfra meta information for naming/tagging.
   * @param cloudInfraConfig - Configuration passed through to the folder + tags.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraFolderConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraFolderArgs | CloudInfraFolderConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // folder config passed straight through (consumed UNCHANGED below).
    const { meta, config: cloudInfraConfig } =
      splitMetaArgs<CloudInfraFolderConfig>(nameOrMeta, argsOrConfig);

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

    // v1: root-level (no parent) → childOpts() aliases back to root for
    // IN-PLACE migration. gcp.organizations.Folder has NO labels → args are NOT
    // passed through withLabels. Preserve protect + replaceOnChanges exactly.
    this.folder = new gcp.organizations.Folder(
      componentName,
      folderArgs,
      this.childOpts({
        protect: protectFlag,
        replaceOnChanges: ['parent'],
      })
    );

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
