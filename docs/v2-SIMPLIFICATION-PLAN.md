# v2 API-Simplification Program

> Approved 2026-06-28 ("go for all, with backward-compat shims"). Synthesizes the 4 adversarial
> API-simplicity reviews + the DevSecOps IAM review. **Enforcement layer deferred (Phase 5).**
> Binding constraint: the **IAM-centralization principle** — IAM is declared in the central
> access-matrix module ONLY; resource-baked IAM (`bucket.grant()`/`run.canRead()`) and any
> freely-importable `grant()` are REJECTED. See memory `iam-centralization-principle`.

## Enabling fact
`v2` is unpublished/unadopted. **Resource-neutral** changes (output-wire shape, reference methods,
export paths, constructor signatures emitting identical resources) are free now — consumers change
code once, zero infra replace. **URN/IAM-name-changing** changes (single/bulk merge, default
auto-label) would replace resources on the v1→v2 apply, so they ship behind **backward-compat shims**
(URN aliases / deprecated overloads / opt-in flags) that preserve the zero-replace migration.
Sequence: **simplify → THEN cut preview packages + admin-app canary** against the final API.

## Decisions (locked)
1. Output wire → ONE flat scalar map; nested `getOutputs()` kept as `@deprecated` shim one release. ✅
2. Flat-key arity → **keep region-only-when-regional** (current). ✅ (revisit only on explicit request)
3. Single+bulk → merge to one class (`string|string[]`) with `CloudInfraBulkX` URN-preserving alias shims. ✅
4. Timing → simplify-before-publish. ✅

## Wave / phase plan
Each item ships via a feature-lead worktree off `v2`: golden net + full tests green → adversarial
review → preview-gate anything that could touch resources (zero-replace on dataos/dev + mtx/dev +
mtx-org/prd) → integrator merge.

### Wave 1 — Phase 0 (correctness) + Phase 1 (additive ergonomics) — grouped by file-area
- **WS-A · access-matrix:** fix `ResourcePrincipalResolver` SA-prefix HIGH bug (forward; SA output
  byte-identical; fail-loud on ambiguity; regression test); export `createAccessMatrix` at root;
  collapse dual use-case input shapes to canonical `{principals, rules}` (keep array parse);
  named principal helpers `saMember()`/`member()`/`ref()`; central-module-only `grant()` one-liner.
- **WS-B · outputs/reference internals:** one shared typed key-composer used by producer + consumer
  (kills the two-alias-table drift machinery). Output keys byte-stable.
- **WS-C · components/construction:** name-first overloads for `folder`/`pam`/`tag`; uniform config
  `Omit` policy (stop `subnet`/`connector` leaking `name`/`project`); unify project field → `project`
  (`projectId`/`gcpProject` deprecated aliases); uniform `labels` surface; hoist the meta/name-first
  split into one shared helper. All additive; resources byte-identical.

### Wave 2 — Phase 2 (public-surface shrink; resource-neutral, deep-import breaking)
Move org/advanced/internal behind `/org` + `/advanced` subpaths (org components, access-matrix
internals, naming-engine guts, `core/helpers`, `*Base`/`create*` leakage, component aliases); hide
`@deprecated` overloads/getters from the primary surface; `NamingMode` enum → flat
`omitPrefix`/`omitLocation`/`preview` booleans (deprecate enum). Root ≈ ~10 components + 4 core objects.

### Wave 3 — Phase 3 (clean API break, resource-neutral) + Phase 3b (URN/IAM-name, shimmed)
- Outputs/refs final: ONE flat wire (`getOutputs()` → deprecated shim); `CloudInfraReference` → one
  `get()` + `all()` (drop 6 deprecated getters + 2-string overload); fold/drop `domainOptional`.
- Construction final: remove meta-first overloads (name-first only; `CloudInfraMeta` stays as escape hatch).
- 3b (shimmed): single+bulk → one class with `CloudInfraBulkX` URN-preserving aliases; deterministic
  reorder-stable auto-`label` (opt-in; preserves existing binding names).

### Wave 4 — Phase 4 (capstone): `CloudInfraService` convention layer
`new CloudInfraService('api', {domain, location})` owns shared meta + internal output manager;
factories `.bucket()`/`.account()`/`.cloudRun()` inherit meta; `svc.outputs()`; auto-registered
outputs (opt-out); one `location`/`region`/`zone` vocabulary. **No `.grant()` / no IAM on the Service** —
IAM stays in the central access-matrix module.

### Then → cut preview packages + admin-app canary against the final, simplified API.

## Phase 5 — DEFERRED (enforcement; not in this program)
Access-matrix guardrails to "earn" the chokepoint: deny/opt-in public principals
(`allUsers`/`allAuthenticatedUsers`), deny primitive roles by default, a policy hook (OPA/conftest),
external/cross-org principal detection, an audit-manifest output. Parked until the simplification lands.

## Progress log
- **Wave 1 — DONE & merged @ `941a04a`, 522 tests, zero-replace gate PASSED** (dataos/dev, mtx/dev, mtx-org/prd; only the known `1customer` delete). WS-A access-matrix (HIGH SA-prefix bug fixed forward — SA output byte-identical, fail-loud on non-SA; `createAccessMatrix` root export; use-case-shape collapse; `saMember`/`member`/`ref` helpers; central `grant()` one-liner). WS-B one shared typed key-grammar (output keys byte-identical). WS-C name-first for folder/pam/tag, uniform `ComponentConfig` Omit, `project` field unify (deprecated aliases), uniform `labels`, hoisted constructor-split helper.
  - **Carry-forward residuals:** (1) name-first `CloudInfraEntitlement` (pam) cannot set GCP-API `location` (type-incompat with `NamingArgs.location`) — meta-first is the escape hatch; (2) the subnet/connector/nat `ComponentConfig` Omit turns a previously-silently-ignored `region`/`name`/`project` config field into a consumer COMPILE error on upgrade (codemod/migration note); (3) NAT nested `router` arm still exposes raw meta-managed fields (follow-up sweep).
