import * as pulumi from '@pulumi/pulumi';
import * as pulumiDynamic from '@pulumi/pulumi/dynamic';
import { execSync } from 'child_process';
import { ResourceError } from '../../core/errors';

/**
 * CloudInfra Organization – ServiceUsage *Bootstrap*
 * -----------------------------------------------
 * Dynamic provider that calls the `gcloud` CLI to enable the **Service Usage
 * API** in a brand-new project *before* other Pulumi resources attempt to
 * enable additional APIs.  Google cloud APIs require Service Usage API to be
 * active first, otherwise we hit 403/failedPrecondition errors.
 *
 * The resource is intentionally idempotent and leaves the API enabled on
 * destroy (no-op in `delete`).
 *
 * @internal – not exported from the package root.
 */

// Interface for the inputs to the ServiceUsageApiBootstrap dynamic provider
interface ServiceUsageApiBootstrapInputs {
  projectId: string;
}

// Dynamic provider that ensures Service Usage API is enabled in a newly created project
class ServiceUsageApiBootstrapProvider
  implements pulumiDynamic.ResourceProvider
{
  async create(
    inputs: ServiceUsageApiBootstrapInputs
  ): Promise<pulumiDynamic.CreateResult> {
    const projectId: string = inputs.projectId;
    try {
      execSync(
        `gcloud services enable serviceusage.googleapis.com --project=${projectId} --quiet`,
        {
          stdio: 'inherit',
        }
      );
      // Allow some time for the enablement to propagate
      await new Promise(res => setTimeout(res, 5000));
    } catch (e) {
      throw new ResourceError(
        `Failed to enable Service Usage API for ${projectId}: ${e}`,
        'project-bootstrap',
        'create'
      );
    }
    return { id: `serviceusage-bootstrap-${projectId}`, outs: {} };
  }

  async delete(id: pulumi.ID): Promise<void> {
    void id; // Explicitly mark as unused - we leave the API enabled on destroy
    // Intentionally left blank – we leave the API enabled on destroy.
  }
}

export class ServiceUsageApiBootstrap extends pulumiDynamic.Resource {
  constructor(
    name: string,
    args: { projectId: pulumi.Input<string> },
    opts?: pulumi.ResourceOptions
  ) {
    super(new ServiceUsageApiBootstrapProvider(), name, args, opts);
  }
}
