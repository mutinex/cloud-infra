export * from './core/meta';
export * from './core/output';
export * from './core/reference';
export * from './config';
export * from './components/account';
export * from './components/bucket';
export * from './components/repository';
export * from './components/cloudrunservice';
export * from './components/cloudrunjob';
export * from './components/database';
export * from './components/role';
export * from './core/access-matrix';
// `createAccessMatrix` is the documented main entry point for the access matrix
// (see core/access-matrix README + JSDoc). It is already re-exported by the
// wildcard above; name it explicitly so the documented entry point and the
// root export stay consistent and discoverable.
export { createAccessMatrix } from './core/access-matrix';
export * from './components/alb';
export * from './components/backendservice';
export * from './components/secret';
export * from './core/helpers';
export * from './components/certificatemap';
export * from './components/instance';

/**
 * **Back-compat re-export of the `/org` tier.**
 *
 * @deprecated The org-hierarchy components moved to their canonical home at
 * `@mutinex/cloud-infra/org`. They remain exported from the package root for
 * backward compatibility and will leave the root at the next major. New code
 * should import them from `@mutinex/cloud-infra/org`:
 *
 * ```ts
 * import { CloudInfraFolder, CloudInfraServiceProject } from '@mutinex/cloud-infra/org';
 * ```
 *
 * Covers: `CloudInfraFolder`, `CloudInfraTag`, the project host/service
 * components, the org network set (subnet / connector / PSA / NAT),
 * `CloudInfraEntitlement` (PAM), and `CloudInfraWIP` / `CloudInfraWIPProvider`.
 */
export * from './org';

export {
  // Configuration objects (live pulumi.Config readers + inlined constants).
  gcpConfig,
  accessMatrixConfig,
} from './config';

/**
 * **Back-compat re-export of the `/advanced` tier.**
 *
 * @deprecated The power-user / internal surface moved to its canonical home at
 * `@mutinex/cloud-infra/advanced`. These symbols remain exported from the
 * package root for backward compatibility and will leave the root at the next
 * major. New code should import them from `@mutinex/cloud-infra/advanced`:
 *
 * ```ts
 * import { ResourceRegistry, resolveMeta, getRegionCode } from '@mutinex/cloud-infra/advanced';
 * ```
 *
 * Covers: access-matrix internals (`ResourceRegistry`, `PrincipalFactory`,
 * `PrincipalResolver`, `grant`/`saMember`/`member`/`ref`, the matrix + error
 * types), naming-engine internals (`resolveMeta`, `splitMetaArgs`, the raw zod
 * schemas, `getRegionCode` / dual-region helpers, `hash7`, the `Gcp*` constant
 * tables), `core/helpers` utilities, the abstract `CloudInfraComponent` base,
 * the per-component `*Base` / `create*` / `*PulumiConfig` types, and the
 * redundant `CloudInfra<X>Component` class aliases.
 */
export * from './advanced';
