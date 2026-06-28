/**
 * Fix #3 regression — `/org` must not EAGERLY read the throwing
 * `gcpConfig.billingAccountId` getter at module-load time.
 *
 * The project custom-config schema's `billingAccount` default was written as
 * `z.string().optional().default(gcpConfig.billingAccountId)`, and `.default(arg)`
 * evaluates `arg` EAGERLY when the schema object is constructed (module load).
 * That made a bare `import '@mutinex/cloud-infra/org'` throw whenever
 * `cloudInfra:billingAccountId` was unset. The fix switches to a LAZY
 * `.optional().transform(v => v ?? gcpConfig.billingAccountId)` so the read fires
 * at PARSE time, not import time. Resolved value is unchanged.
 *
 * This file deliberately sets ONLY `gcp:project` (NOT `cloudInfra:billingAccountId`)
 * so the eager-read regression would throw on import. Vitest isolates each test
 * file's module registry, so this config state does not leak from / into the
 * public-surface suite (which sets the full config).
 */
import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

pulumi.runtime.setConfig('gcp:project', 'test-project');

describe('fix #3 — lazy billingAccount default', () => {
  it('importing /org without cloudInfra:billingAccountId does NOT throw', async () => {
    await expect(import('../../../org')).resolves.toBeDefined();
  });

  it('schema construction (import of project/common) does NOT throw', async () => {
    await expect(
      import('../common')
    ).resolves.toHaveProperty('CloudInfraProjectCustomConfigSchema');
  });

  it('resolved value is identical to the old eager .default() at parse time', async () => {
    pulumi.runtime.setConfig(
      'cloudInfra:billingAccountId',
      'AAAAAA-BBBBBB-CCCCCC'
    );
    const { CloudInfraProjectCustomConfigSchema } = await import('../common');

    // Omitted → substitutes the configured account (same as `.default(...)`).
    expect(CloudInfraProjectCustomConfigSchema.parse({}).billingAccount).toBe(
      'AAAAAA-BBBBBB-CCCCCC'
    );

    // Explicit → passes through unchanged.
    expect(
      CloudInfraProjectCustomConfigSchema.parse({
        billingAccount: 'ZZZZZZ-YYYYYY-XXXXXX',
      }).billingAccount
    ).toBe('ZZZZZZ-YYYYYY-XXXXXX');
  });
});
