/**
 * WS-C Task 1 — `CloudInfraFolder` name-first ≡ meta-first equivalence.
 *
 * Proves the new `new CloudInfraFolder(name, args?, opts?)` overload produces a
 * Folder INDISTINGUISHABLE from the legacy meta-first
 * `new CloudInfraFolder(new CloudInfraMeta({ name, ... }), config)` form.
 *
 * Pinned (state-sensitive surfaces): component label `getGeneratedName()`, the
 * Folder's `displayName` (= generated name, the GCP identity), the captured
 * Pulumi resource name, and `parent`/`deletionProtection` key fields.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

pulumi.runtime.setConfig('gcp:project', 'test-project');

interface CapturedResource {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
}
const captured: CapturedResource[] = [];

pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
      captured.push({ type: args.type, name: args.name, inputs: args.inputs });
      return {
        id: `${args.name}-id`,
        state: { ...args.inputs, name: args.inputs.name ?? args.name },
      };
    },
    call(): Record<string, unknown> {
      return {};
    },
  },
  'project',
  'stack'
);

// Import AFTER mocks are configured.
import { CloudInfraMeta } from '../../../core/meta';
import { CloudInfraFolder } from '../index';

const T_FOLDER = 'gcp:organizations/folder:Folder';

function read<T>(out: pulumi.Output<T>): Promise<T> {
  return new Promise<T>(resolve => {
    out.apply(v => {
      resolve(v);
      return v;
    });
  });
}

async function waitForCaptures(): Promise<void> {
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 10));
    const now = captured.length;
    if (now > 0 && now === last) return;
    last = now;
  }
}

describe('WS-C Task 1 — CloudInfraFolder name-first ≡ meta-first', () => {
  let meta_folder: CloudInfraFolder;
  let name_folder: CloudInfraFolder;

  beforeAll(async () => {
    meta_folder = new CloudInfraFolder(
      new CloudInfraMeta({ name: 'platform', domain: 'gl' }),
      { parent: 'organizations/123' }
    );
    name_folder = new CloudInfraFolder('platform', {
      domain: 'gl',
      parent: 'organizations/123',
    });
    await waitForCaptures();
  });

  it('component label (getGeneratedName) is identical', () => {
    expect(name_folder.getGeneratedName()).toBe(
      meta_folder.getGeneratedName()
    );
    // conventional formula: prefix-name-loc.
    expect(meta_folder.getGeneratedName()).toBe('project-platform-gl');
  });

  it('Folder displayName (generated name → GCP identity) is identical', async () => {
    const metaDisplay = await read(meta_folder.getFolder().displayName);
    const nameDisplay = await read(name_folder.getFolder().displayName);
    expect(nameDisplay).toBe(metaDisplay);
    expect(metaDisplay).toBe('project-platform-gl');
  });

  it('parent and deletionProtection key fields are identical', async () => {
    const metaParent = await read(meta_folder.getFolder().parent);
    const nameParent = await read(name_folder.getFolder().parent);
    expect(nameParent).toBe(metaParent);
    expect(metaParent).toBe('organizations/123');

    const metaDp = await read(meta_folder.getFolder().deletionProtection);
    const nameDp = await read(name_folder.getFolder().deletionProtection);
    expect(nameDp).toBe(metaDp);
  });

  it('captured Folder resource names match across overloads', () => {
    const names = captured
      .filter(r => r.type === T_FOLDER)
      .map(r => r.name);
    // Both folders use the same logical resource name (generated name).
    expect(names.filter(n => n === 'project-platform-gl').length).toBe(2);
  });
});
