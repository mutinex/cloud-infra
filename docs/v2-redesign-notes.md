# cloud-infra v2 — Design Notes & Decision Record

Status: **design locked, prototyping**. Owner: DevSecOps lead. Last updated: 2026-06-26.

This is the authoritative brief for the v2 rework of `@mutinex/cloud-infra`. It captures
the constraints, the red-teamed decisions, and the migration pathway. Read this before
touching code.

---

## 1. Goal

Radically simplify the library into "an incredibly clean, nice, easy-to-use library of
reusable components" that enforces our **naming** and **labelling** conventions — without
forcing costly Pulumi resource migrations.

We MAY break the library's TypeScript/public API (clean v2 + codemod the consumers).
We MUST NOT trigger destroy/recreate of existing cloud resources except through an
explicitly-gated, non-destructive migration.

---

## 2. The Frozen Contract (must stay byte-identical, or resources get replaced)

URN identity in Pulumi = (type token, logical name string, parent chain). These are the
things that, if changed without an alias, replace resources:

- **F1 — `generateName()` output.** `core/meta/meta.ts:267-291` + everything it calls
  (region tables `locations.ts:87-135`, `hash7` `locations.ts:256`, prefix =
  `pulumi.getProject()`). This string is the Pulumi logical name AND flows into PHYSICAL
  cloud identity: service-account `accountId` (`account/common.ts:145` → the SA *email*),
  bucket physical name (`bucket/single.ts:172`, Pulumi auto-name prefix), secret `secretId`,
  SQL `name`. **Changing it changes cloud identity → replacement (and for buckets/SQL, data
  loss).** The convention (region + domain + service in the name) is STAYING — this is a
  desired feature, not debt.
- **F2 — Child-resource suffix conventions.** The `:`-delimited project/folder names,
  certificatemap `-domain`/`-cert.name`/`-hostname`, ALB's bare-name reuse, the 12 ALB type
  tokens. See `policy-rule-processor.ts`, `project/{host,common}.ts`, `certificatemap/index.ts`.
- **F3 — Access-matrix IAM name formula** `${componentName}:${safeRole}:${principalIdentifier}`
  + the 100-char truncation. `access-matrix/core/policy-rule-processor.ts:241-274`.
- **F4 — `getIdentifier()` formats** (`reference-manager.ts:274-280`,
  `reference-without-domain.ts:165`) — baked into CONSUMER IAM URNs. The output WIRE format
  is NOT frozen (we are flattening it — see §5 Move 4), but `getIdentifier` is.

## 3. The Trap List (red-team findings — do NOT "fix" these)

1. **`deduplicate()` no-op** (`principal-factory.ts:210`, both ternary branches identical).
   Dedups objects by identity. "Fixing" it deletes production IAM bindings. Freeze + comment.
2. **`resources/` dir is NOT fully dead.** `ResourceRegistry.getHandler().supportedType` and
   `getResourceName()` are live and feed IAM naming. Only the handler *method bodies*
   (`extractResourceInfo`, instance `createIamBinding`) are dead.
3. **`Config` singleton not fully dead.** `maxResourceNameLength=100` truncation (F3) and
   certificatemap's `certificateMaxLength` are live. Inline used constants at EXACT values.
4. **Access-matrix principal/rule iteration order** feeds fallback names (`principal-N`,
   `role-N`). Preserve concat order config→case→rule. Do not reorder.
5. **`label` required for non-string roles: forward-only.** Adding a label to an existing
   label-less rule renames its IAM binding (`role-N` → label). Codemod must NOT inject labels
   into existing rules.
6. **Bulk → `.map()` is safe for the resources, but bulk feeding access-matrix embeds the
   bulk MAP KEY** in the IAM binding name. An array-of-singles must preserve that key or
   bindings rename. Verify per-component with preview.
7. **Decorators are unused** — `emitDecoratorMetadata`/`experimentalDecorators` are vestigial.
   `@swc/core` stays (tsup/vitest transform), the decorator flags can go.
8. **Label stamping is NOT universal, and transformations propagate to TRANSITIVE children.**
   Some GCP types have no `labels` field and HARD-ERROR if one is injected. The label
   transformation attached to a parent via `childOpts` is **inherited by grandchildren too**
   (Pulumi transformation inheritance) — so a label-less grandchild of a label-supporting
   parent will break even if it was created with plain opts. `LABEL_UNSUPPORTED_TYPES` MUST
   therefore list label-less descendants at any depth. Confirmed-and-added so far: serverless
   `RegionNetworkEndpointGroup`, `SecretVersion`, `RegionalSecretVersion`. The validated
   label-support map (from the dataos whole-stack pass) is in §9.
9. **ComponentResource breaks access-matrix resource-type discovery.** Once a wrapper
   `extends ComponentResource`, it carries its own `cloud-infra:...` `__pulumiType`, which
   short-circuits `ResourceRegistry.discoverResourceType`/`extractPulumiResource` BEFORE the
   `getService()`/getter fallback that recovers the real underlying GCP type. Fix (load-bearing
   for EVERY component conversion): for `cloud-infra:`-prefixed `__pulumiType`, fall through to
   the component getters first. This WILL hit every component as it converts.

---

## 4. Architecture Decision: migrate to `pulumi.ComponentResource` — YES

Reversed twice under red-team; final decision is YES, paved incrementally. Rationale:

**Benefits (red-team verdict, evidence-backed):**
- **Labelling enforcement — SUBSTANTIVE, our #1 goal.** Today there is ~zero systematic
  labelling (only a passthrough at `secret/index.ts:24`). Threading labels via args is
  error-prone *by construction* — e.g. `cloudrunservice/index.ts:64` spreads `...config` into
  the Service but the NEG (`:68-77`) does not, so a label via config silently misses the NEG.
  A ComponentResource + constructor-level transformation stamps org labels onto EVERY child
  uniformly. Architecturally unreachable cleanly without the component boundary.
- **Multi-resource encapsulation — SUBSTANTIVE.** 74 flat-sibling instantiation sites;
  components emit up to ~15 ungrouped children (project, certificatemap, ALB). Grouping gives
  one addressable URN, clean `stack graph`, aggregate `--target`.
- **Composability — SUBSTANTIVE.** Already composing by hand-threading getters
  (NAT/PSA/Connector/Subnet, host/service split) without the right primitive.
- Outputs — minor (registerOutputs removes manual `record()` bookkeeping; does not replace
  the cross-stack export schema).
- Dependency ordering — COSMETIC. `dependsOn`/`DelayResource`/`deleteBeforeReplace` survive
  migration unchanged.

**ComponentResource does NOT eliminate the naming convention** — `generateName` produces
physical cloud identities. That's fine: we are KEEPING the convention. Naming (physical name)
and labelling (queryable metadata) are orthogonal and complementary; both encode
region + domain + service.

**Migration risk = HIGH EFFORT, LOW DANGER (not "data loss").**
- Wrapping in ComponentResource changes the URN (adds parent path). `aliases: [{ parent: <old> }]`
  maps old→new URN as the SAME resource — updated in place, no recreate. Physical names are
  decoupled from URNs throughout, so correct parenting is a cloud-level no-op.
- A MISSED alias surfaces as a visible `replace`/`delete` in `pulumi preview`; on `protect:true`
  resources (folder, project) it hard-errors instead of destroying. Gate: **preview must show
  ZERO replace/delete/create before apply.** Under that gate it is mechanically safe.
- Subtle (process, not destruction) hazards: `pulumi refresh` does not honor aliases — don't
  interleave refresh mid-migration; aliases must live in code until every consuming stack has
  `up`'d past them, then be removed carefully. Both re-surface in a later preview.
- Bulk/loop components need per-item aliases — most tedious, highest omission risk (still
  preview-catchable).

---

## 5. The Moves (revised, post red-team)

- **Move 1 — Fold Meta into the component.** `new CloudRunService("api", { domain:"au", ...config })`.
  Meta becomes an internal `resolveNaming()` helper; no developer constructs it. The 5
  throwing location getters and getter/alias ceremony disappear. Internally computes identical
  `generateName` + same config → state-safe. NOTE: multi-resource components derive child names
  from CONFIG (not just name), so v2 must keep receiving the full config.
- **Move 2 — Kill single/bulk classes.** Bulk = `names.map(n => new Single(n, args))`. Safe for
  account + bucket (only two bulk components). Preserve per-item config merge
  `{...common, ...custom[key]}` and the access-matrix bulk-key (Trap 6).
- **Move 3 — Keep all 5 `generateName` formulas.** Do NOT collapse to 2 modes (REFUTED —
  `omitDomain`-only→`prefix-name`, `omitPrefix`-only→`name-loc`, `preview`→`prefix-name-hash7`
  are all live public behavior). Re-skin the 3-boolean matrix as a clearer named option, same
  reachable outputs. Pin the instance zonal `-a` default explicitly.
- **Move 4 — Flatten outputs, dual-emit.** Replace nested `domain→type→group` with a flat,
  self-describing array. Producer is ZERO resource risk (outputs aren't resources). Dual-emit
  old `v1` + new `cloudInfra` during transition; migrate consumers behind a preview gate; drop
  `v1` after. Keep `getIdentifier()` byte-identical (F4).
- **Move 5 — Tighten access-matrix surface (forward-only).** One case shape; `label` required
  for non-string roles for NEW code only; accept arrays. Do not change existing names/ordering.

### Reference API simplification (Move 4 cont.)
`new CloudInfraReference("org/project/env")` (positional stack, domain optional) →
`ref.get("my-app").email` (one verb + property access, lazy validated Outputs), type/domain
only as collision disambiguators. `.identifier` moves onto the record. Merge
`ReferenceWithoutDomain` in (domain optional). `getIdentifier` formula frozen (F4).

---

## 6. Pathway (incremental, new-first)

1. New components are ComponentResource from day one (zero migration).
2. Build the shared base: `CloudInfraComponent` (ComponentResource) with label-stamping
   transformation + naming resolver. This is the clean core.
3. Migrate existing components incrementally, highest-value first (multi-resource:
   cloudrunservice → ALB → project), each behind the zero-replace preview gate. Single-resource
   (account, bucket) last.
4. Clean v2 + codemod consumers (chosen migration model). Codemod is SEMI-automatic — ~10
   patterns need human review (conditional resourceType, bespoke grouping keys, accessMatrix
   YAML case-name matching, getAccounts key embedding). Every consumer stack gated on clean
   preview.

---

## 7. Prototype Plan (current step)

**Component: `CloudRunService`** (2 children: Service + RegionNetworkEndpointGroup). Smallest
thing that proves the whole pathway:
- Demonstrates the label-stamping base (and fixes the real NEG-misses-config bug).
- Demonstrates encapsulation (Service + NEG under one component URN).
- Demonstrates the aliased, non-destructive URN migration with a clean preview.

Then `ServiceAccount` second — proves single/bulk collapse + access-matrix identity
preservation (the SA email / `getIdentifier` parity).

NOTE: this repo is a LIBRARY (no live stack/state here), so "preview proof" in-repo = unit
tests / golden snapshots asserting (a) `generateName` output unchanged, (b) the alias maps the
old flat URN → new parented URN, (c) labels reach BOTH children. A literal `pulumi preview`
against real state happens later in a consuming stack.

---

## 8. Open Questions

- Do we move env/domain OUT of the physical name into labels only? (Decided: NO — keep
  region+domain+service in the name; ALSO add as labels.)
- Component type-token namespace: prototype used `cloud-infra:cloudrunservice:CloudRunService`.
  Confirm the final scheme before broad migration — it's baked into NEW URNs (but NOT into the
  migration safety: children alias back to their old flat URNs regardless of the parent token).

---

## 9. Validation Results — real `pulumi preview` against dataos `dev` (2026-06-27)

Tested the in-place ComponentResource conversion of `CloudInfraCloudRunService` (same
meta-based signature, aliases + label stamping) against the REAL deployed `mutinex/dos/dev`
stack (consumer `dataos/infra/backend/cloudrun.ts`). Read-only preview, in isolated worktrees.

**VERDICT: the convention migrates the deployed Cloud Run service IN-PLACE. Zero replace/
delete/create of any cloud resource.**
- **Service → update-in-place** (matched by `id`; alias `{ parent: rootStackResource }` worked).
  Only diff is the new labels (expected) + a cosmetic `scaling` null-out.
- **NEG → no change at all** (in the `146 unchanged`). **Parent-alias inheritance reconstructed
  the NEG's old URN with NO explicit alias** — this resolves the one question the unit-test
  mocks could not (prototype §5 honesty note). No explicit NEG alias needed.
- **Component node → "create"** = logical grouping only, no cloud backing (free no-op).
- Generated name byte-identical (`dos-api-au`), F1 preserved.

**Two systemic consumer-breaks caught (mocks missed both; now Trap List §8/§9, both fixed,
re-preview clean):** (1) NEG hard-errors on injected `labels` → per-type skip-list required;
(2) access-matrix type discovery short-circuits on the component's `__pulumiType` → getter
fallthrough fix, load-bearing for every conversion.

**Mechanics that worked:** local lib linked into dataos via yarn `resolutions` →
`"@mutinex/cloud-infra": "portal:<cloud-infra worktree>"` (each monorepo project is a
standalone yarn-4 package, no root workspace). Pulumi nodejs runtime loaded the portal symlink
fine. Auth was already in place (pulumi=nzav, ADC, GITHUB_PACKAGES_TOKEN).

**Artifacts:** cloud-infra worktree `experiment/cloudrun-cr` at `/Users/nik.zavgorodny/Dev/cloud-infra-wt-v2`;
monorepo worktree `experiment/v2-cloudrun-preview` at `/Users/nik.zavgorodny/Dev/monorepo-wt-v2-cloudrun-preview`.

### 9b. WHOLE-STACK validation — all ~15 dataos components converted (2026-06-27)

Converted every component dataos uses (Bucket, Secret, Repository, Database{Instance,Database,User},
Subnet, PSA, Nat, ALB, BackendService, ComputeInstance, CloudRunJob, Account/BulkAccount, Role,
CertificateMap — plus CloudRunService) to ComponentResource via 5 parallel agents, merged to
branch `experiment/v2-dataos-canary` (canary worktree `/Users/nik.zavgorodny/Dev/cloud-infra-wt-canary`,
HEAD `64dcb25`), and ran ONE `pulumi preview --diff` on `mutinex/dos/dev`.

**RESULT: `+22 create, ~22 update, 125 unchanged — ZERO replace/delete/create of cloud resources.`**
The 22 creates are all logical `cloud-infra:*` component nodes (no cloud backing). The 22 updates
are all `gcp:*` resources with preserved `[id=...]` → in-place (labels only, + one cosmetic Cloud
Run `scaling` null-out). Generated names byte-identical (F1). The whole dataos dev stack migrates
in-place. (Preview at `/tmp/dataos-v2-preview.txt`; combined build/test 293/293 green.)

**Validated label-support map** (childOpts vs plain `{parent}`):
- LABELS: storage.Bucket, secretmanager.Secret/RegionalSecret, artifactregistry.Repository,
  cloudrunv2.Job, cloudrunv2.Service, compute.Instance, compute.GlobalAddress/Address,
  compute.GlobalForwardingRule/ForwardingRule, certificatemanager.{Certificate,CertificateMap,
  CertificateMapEntry,DnsAuthorization}.
- NO LABELS (plain parent): sql.DatabaseInstance(top-level)/Database/User, secretmanager
  SecretVersion/RegionalSecretVersion, ALL networking (Router/RouterNat/Route/Subnetwork/
  servicenetworking.Connection/gcp.Provider), compute.BackendService/RegionBackendService/
  HealthCheck, ALB URLMap/RegionUrlMap/all TargetProxy variants/SSLCertificate/RegionSslCertificate,
  serverless RegionNetworkEndpointGroup, serviceaccount.Account, organizations/projects.IAMCustomRole,
  cloudflare.DnsRecord.

**Only real break found + fixed:** SecretVersion inherited its parent Secret's label transform
(transitive inheritance) and hard-errored → added to `LABEL_UNSUPPORTED_TYPES` (Trap §8).
Access-matrix discovery needed NO extension (the 10 discovery getters map 1:1 to the 10 handler
types; dataos passes only Bucket/Secret/Service into matrices, all covered).

**(Closed — see §9c.)** The org/project components NOT used by dataos —
`CloudInfraHostProject`/`ServiceProject` (dynamic providers `DelayResource` +
`ServiceUsageApiBootstrap`, `protect:true`, `deleteBeforeReplace`, long `dependsOn` chains),
Folder, Tag, PAM/Entitlement, Connector, WIP — converted and previewed against gcp-organization.

### 9c. ORG/PROJECT validation — gcp-organization, incl. PROD (2026-06-27)

Converted the remaining org components and previewed against three real gcp-organization stacks
(canary HEAD `2cd99d3`). **All migrate fully IN-PLACE — zero migration-caused replace/delete,
including prod:**
- **mtx/dev** (HostProject, ServiceProject, WIP, Connector): both `gcp.organizations.Project`
  update-in-place via root-alias; all ~10 deep-nested children per project (Service, IAMMember,
  ServiceIdentity, TagBinding, SharedVPC bindings, BOTH dynamic providers) land in `unchanged` via
  parent-alias inheritance — **no explicit child aliases needed** (the inheritance bet held even
  at depth). (One pre-existing `1customer` IAMMember delete is v1 config drift, NOT migration —
  proven by an identical baseline v1 preview.)
- **mtx-org/prd** (PROD: Folder, Tag, PAM, Connector): all 3 `protect:true` Folders update, not
  replace. Zero replace/delete. Protect+alias migration safe against prod.
- **mtx-apps/dev**: cross-consumer check on already-converted components — in-place.

**Gotcha hit + fixed:** the project's label-supporting `Project` parent pushed the label transform
onto its label-less grandchildren (Trap §8 transitive inheritance) → `TagBinding` hard-errored.
Added 8 tokens to `LABEL_UNSUPPORTED_TYPES`: `gcp:projects/service:Service`,
`gcp:projects/iAMMember:IAMMember`, `gcp:projects/serviceIdentity:ServiceIdentity`,
`gcp:tags/tagBinding:TagBinding`, `gcp:compute/network:Network`,
`gcp:compute/sharedVPCHostProject:SharedVPCHostProject`,
`gcp:compute/sharedVPCServiceProject:SharedVPCServiceProject`, `pulumi-nodejs:dynamic:Resource`.
**Rollout rule:** any component parenting children under a label-supporting resource must skip-list
EVERY label-less transitive descendant (incl. dynamic providers). Access-matrix discovery needed
no extension (getters align 1:1; verified for Project/Folder/Repository/Subnetwork).

### 9d. ACCESS-MATRIX DISPATCH COLLAPSE validation — all 3 stacks (2026-06-27, v2 @ `9a70a70`)

Gated the access-matrix dispatch rewrite (single `createIamBinding` switch + flattened
`principal-factory` resolver list) against the same three stacks via the §6 runbook (consumers
repointed to the combined candidate worktree, `NODE_OPTIONS` preview --diff). **PASS — byte-identical
IAM output confirmed:**
- **mtx/dev**: 0 IAM replace, 0 IAM create-rename. The sole IAM op was the known pre-existing
  `1customer` SA-IAMMember delete (same v1 config drift as §9c, NOT this change). Summary `+17 ~7 -1`.
- **mtx-org/prd** (PROD): `+25 ~5`, ZERO delete, ZERO replace.
- **dataos/dev**: `+22 ~22`, ZERO delete, ZERO replace.
- Across all three, the ONLY `*IAMMember` resource-operation line was that one known delete → every
  access-matrix-generated binding sits in `unchanged`, i.e. no logical-name change from the rewrite.
  Remaining `~`/`-` lines are benign gcp 8.36→8.41 label drift, not resource churn.

Proof chain beyond the gate: 493/493 tests green (golden F1–F4 incl. F3 IAM-name + dedup no-op), tsc +
build clean, and a manual cross-check that all 11 `new gcp.*IAMMember(...)` constructor calls in
`iam-binding.ts` are verbatim transcriptions of the deleted per-type builders. Net −314 LOC.

### 9e. DX2 BULK name-first validation — all 3 stacks (2026-06-27, v2 @ `e73b21a`)

Added name-first overloads to `CloudInfraBulkBucket` + `CloudInfraBulkAccount` (+ a `resolveMeta(names:
string[], …)` overload); meta-first kept `@deprecated` and byte-unchanged (the constructor normalizes both
forms to a `(meta, config)` pair, then runs the ORIGINAL body). Gated via the §6 runbook. **PASS — diffs
byte-identical to the §9d baseline:** mtx/dev `+17 ~7 -1` / 93 unchanged (the `-1` is the same known
`1customer` SA-IAMMember drift), mtx-org/prd `+25 ~5` / 34 unchanged, dataos/dev `+22 ~22` / 125 unchanged.
ZERO replace anywhere. Critically, `CloudInfraBulkAccount` is LIVE meta-first in mtx/dev + dataos/dev and
feeds the access-matrix (Trap 6 bulk-key → IAM binding names); all those bindings stayed `unchanged`,
proving the input-name key embedding is preserved. +10 equivalence tests pin component-label / child-name /
`getAccounts`-key / custom-override parity (440 → 450 green).

**NOT done (deliberate):** the structural "kill single/bulk → `names.map(n => new Single(n))`" collapse from
Move 2. `Single` is its own `CloudInfraComponent` URN node whereas bulk is ONE node with N children → the
map-over-single form restructures the URN tree and forces mass replacement. Destructive + low value; the
name-first parity (the real DX win) was achieved additively without it. If ever revisited, it requires a
component-node-preserving design + a full zero-replace gate — do not attempt as a naive `.map`.

### Rollout caveats (carry forward)
- **Provider drift interleaves with migration diffs.** Previews ran on gcp 8.41 vs deployed 8.36 —
  benign in-place updates (`configuredCapabilities: null`, extra custom-role permissions) appear
  alongside the label updates. Re-evaluate the zero-replace gate against the provider version the
  APPLY actually pins.
- **Repository-fed access-matrix** is only in mtx/prd (not previewed) — confirm before that apply.
- Pulumi nodejs runtime needs `NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main` when
  consuming the lib via a portal: symlink.
- Everything so far is PREVIEW-ONLY. No apply has run. The per-stack zero-replace preview gate
  remains the ship criterion.
