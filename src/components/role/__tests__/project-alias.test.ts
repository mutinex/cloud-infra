/**
 * WS-C Task 3 — `CloudInfraRole` unified `project` field + deprecated aliases.
 *
 * Proves the canonical `project` config field and the `@deprecated`
 * `projectId` / `gcpProject` aliases all resolve to the SAME project value on the
 * emitted `gcp.projects.IAMCustomRole` (byte-identical resource), and that
 * `project` wins over the aliases when both are set.
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
    call(args: pulumi.runtime.MockCallArgs): Record<string, unknown> {
      // `gcp.iam.getTestablePermissions` returns `{ permissions: [{name}] }`;
      // the role maps over `.permissions`, so it must be an array. Echo the
      // requested permissions back as "supported" so filtering keeps them.
      if (args.token.includes('getTestablePermissions')) {
        return { permissions: [{ name: 'resourcemanager.projects.get' }] };
      }
      return {};
    },
  },
  'project',
  'stack'
);

import { CloudInfraRole } from '../index';

const T_PROJECT_ROLE = 'gcp:projects/iAMCustomRole:IAMCustomRole';

async function waitForRoleResources(expected: number): Promise<void> {
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 10));
    if (captured.filter(r => r.type === T_PROJECT_ROLE).length >= expected) {
      return;
    }
  }
}

const basePerms = { title: 'Tester', permissions: ['resourcemanager.projects.get'] };

describe('WS-C Task 3 — CloudInfraRole project field + deprecated aliases', () => {
  let role_project: CloudInfraRole;
  let role_projectId: CloudInfraRole;
  let role_gcpProject: CloudInfraRole;
  let role_precedence: CloudInfraRole;

  beforeAll(async () => {
    role_project = new CloudInfraRole('viewer-a', {
      naming: 'no-location',
      project: 'my-proj',
      ...basePerms,
    });
    role_projectId = new CloudInfraRole('viewer-b', {
      naming: 'no-location',
      projectId: 'my-proj',
      ...basePerms,
    });
    role_gcpProject = new CloudInfraRole('viewer-c', {
      naming: 'no-location',
      gcpProject: 'my-proj',
      ...basePerms,
    });
    // project wins over projectId/gcpProject when all set.
    role_precedence = new CloudInfraRole('viewer-d', {
      naming: 'no-location',
      project: 'win-proj',
      projectId: 'lose-proj',
      gcpProject: 'lose-proj-2',
      ...basePerms,
    });
    // Each role creates the IAMCustomRole inside a permissions-filter apply, so
    // wait until all 4 project-level roles have been captured.
    await waitForRoleResources(4);
  });

  // `no-location` naming → `prefix-name` = `project-<inputName>`.
  function projectInputFor(roleResourceName: string): unknown {
    const rec = captured.find(
      r => r.type === T_PROJECT_ROLE && r.name === roleResourceName
    );
    return rec?.inputs.project;
  }

  it('project, projectId and gcpProject all resolve to the same project input', () => {
    expect(projectInputFor('project-viewer-a')).toBe('my-proj');
    expect(projectInputFor('project-viewer-b')).toBe('my-proj');
    expect(projectInputFor('project-viewer-c')).toBe('my-proj');
  });

  it('canonical `project` wins over deprecated aliases', () => {
    expect(projectInputFor('project-viewer-d')).toBe('win-proj');
  });

  it('no alias key leaks into the emitted resource args', () => {
    const rec = captured.find(
      r => r.type === T_PROJECT_ROLE && r.name === 'project-viewer-a'
    );
    expect(rec).toBeDefined();
    expect('projectId' in (rec!.inputs as object)).toBe(false);
    expect('gcpProject' in (rec!.inputs as object)).toBe(false);
  });
});
