# @mutinex/cloud-infra v2 — Session Handover / Operating Prompt

> **This document IS your prompt — read it top to bottom and adopt it.** It lets a fresh session resume
> with zero loss. Authoritative companions: `docs/v2-redesign-notes.md` (Frozen Contract F1–F4, Trap List,
> validated label map, real-preview results), `docs/v2-MIGRATION.md` (v1→v2 consumer runbook),
> `docs/v2-SIMPLIFICATION-PLAN.md` (what the simplified API is + why).
>
> **Trunk: branch `v2` @ `6c28b0f`, 762 tests green, pushed to `origin/v2`.** Last updated 2026-06-28.
>
> ⚠️ The work lives on the long-lived **`v2`** branch, NOT `main`. Use the integrator worktree
> **`/Users/nik.zavgorodny/Dev/cloud-infra-wt-v2trunk`** (checked out on `v2`) for merges/builds; spawn
> feature-lead worktrees off `v2`. **Everything is PREVIEW-ONLY — no `pulumi up/apply` has ever run.**

---

## 1. The goal
Make `@mutinex/cloud-infra` v2 a set of **easy-to-use building blocks for assembling new GCP services that
follow best Pulumi + Google Cloud practices** — uniform, name-first, minimal-boilerplate, with a clean
public surface and a single controlled path for IAM. The library rework AND a full API-simplification
program are **complete**; the remaining work is to **ship v2 to consumers**.

## 2. Current state (what's in `v2`)
Complete, gated zero-replace on all consumer stacks, and adversarial-review-cleared. Highlights:
- **Components** are all `pulumi.ComponentResource`s with non-destructive root-aliases (v1→v2 upgrades in place).
- **Name-first construction everywhere**: `new X("name", { domain, location?, prefix?, naming?, ...config })`
  (incl. folder/pam/tag); meta-first kept `@deprecated`. `NamingMode` enum replaced by flat
  `omitPrefix`/`omitLocation`/`preview` flags (enum deprecated). Uniform config `Omit` + `project` field + `labels`.
- **Outputs/refs**: flat keyed wire `getFlatOutputs()` → `Record<key,Output<string>>` keyed
  `<domain>.<service>[.<region>].<name>.<field>` (plain `StackReference.requireOutput` friendly; nested
  `getOutputs()` retained `@deprecated`). `CloudInfraReference.get(name,{type?,domain?})`; legacy getters `@deprecated`.
- **Access-matrix** (the SINGLE controlled IAM path): one `createIamBinding` switch; named principal helpers
  `saMember()`/`member()`/`ref()`; a central `grant(to,role,on)` one-liner; opt-in deterministic auto-label.
- **Public surface**: `@mutinex/cloud-infra/org` + `/advanced` subpaths (full root back-compat via `@deprecated`
  re-exports; `package.json` `exports` is exhaustive — only `.`/`./org`/`./advanced` resolve).
- **single+bulk merged**: each component is ONE class taking `string | string[]`; `CloudInfraBulkX` remain as
  `@deprecated` URN-preserving aliases.
- **`CloudInfraService`** convention layer: declare `{domain,location}` once → `svc.bucket()/.account()/.cloudRun()/…`
  inherit it + auto-collect into `svc.outputs()`. **It has NO IAM surface** (see Directives — IAM is centralized).
- **Frozen-Contract golden net** `src/core/__tests__/frozen-contract/` (F1 names, F2 aliases/ALB tokens, F3
  IAM-name+truncation, F4 getIdentifier) — the regression guard; MUST stay green.

**Deferred to a future MAJOR** (can't be shimmed losslessly, so out of scope until shims drop):
output-wire collapse (flat can't hold the nested wire's non-scalar `urls[]`/`customPlacementConfig`);
hard removal of the `@deprecated` meta-first overloads + reference getters; the access-matrix **enforcement
layer** (deny public `allUsers`/primitive roles, policy hook, external-principal detection, audit manifest).

## 3. NEXT TASK — the SHIP path (user-driven; the user has approved proceeding)
Keep `v2` a long-lived BRANCH; do **NOT** merge to `main` yet. In order:
1. **Wire a preview-publish CI workflow off `v2`** — publish a prerelease package to a `next`/`preview`
   dist-tag on each push to `v2` (build is clean CJS/ESM/DTS, 762 tests). This is the enabling plumbing and
   the right first action. **Publishing is outward-facing → an explicit user go; build the workflow, confirm before the first real publish.**
2. **Canary the admin-app repo first** (low-risk consumer) against the preview package; gate it clean.
3. Then the org/monorepo stacks (gcp-organization mtx/mtx-org/mtx-apps; monorepo growthos/platform/dataos),
   one at a time, each gated to zero-replace, gcp provider pinned, human-reviewed `pulumi up`.

**Consumer runbook + codemod sharp-edges:** `docs/v2-MIGRATION.md`. The ones a fresh session MUST carry:
- **`location` foot-gun**: name-first fuses naming-location & deploy-region — a consumer setting deploy region
  via `config.location` must DROP it when porting or the resource renames+REPLACES (escape hatch: `@deprecated` meta-first).
- **Compile-breaks on upgrade (latent bugs surfaced, not regressions):** the subnet/connector/nat config `Omit`
  turns a previously-ignored `region`/`name`/`project` config field into a TYPE error; name-first
  `CloudInfraEntitlement` (pam) cannot set GCP-API `location` (use meta-first there).
- **Imports**: org/advanced symbols' canonical home is the `/org` + `/advanced` subpaths (root still re-exports
  `@deprecated`); no deep imports resolve. `CloudInfraService` is the recommended new-service entry.
- `gcpProject` meta field → name-first config `project:`. Pin the gcp provider for any apply (8.36→8.41 benign
  drift). Known pre-existing `1customer` IAMMember delete in mtx/dev is v1 config drift, NOT migration.

## 4. Standing directives (carry these)
- **MERGE AUTHORITY on `v2`**: merge on a clean gate without asking per-merge; escalate only genuine ambiguity/risk.
- **Applying to real infra / publishing the package = explicit USER decision.** Never `pulumi up/apply/destroy/refresh`.
- **IAM-centralization principle** (memory `iam-centralization-principle`): IAM is declared ONLY in the central
  access-matrix module; external-consumer grants MUST route through it. Reject resource-baked IAM
  (`bucket.grant()`/`run.canRead()`) and any freely-importable `grant()`.
- **Delegate** implementation to feature-lead agents (you orchestrate, keep context lean); each works in its OWN
  worktree, commits per step, stops pre-merge. **Run dedicated review teams** (Forge `reviewing-code`: 4 reviewers
  per area, synthesized) on substantive changes — they catch what self-reviews miss.
- **Your "happy" bar before merge**: `yarn build` + `tsc --noEmit` + full `yarn test` incl. golden net green;
  reviewers' Critical/Major fixed-or-refuted; **zero-replace real preview for anything touching resource/IAM paths**;
  your own diff check. Chunk + commit frequently (long single-agent runs hit ~18-min connection drops).

## 5. Team + work cycle (for any further change)
Each workstream → a feature-lead agent (`general-purpose` or `forge:implementer`) in an isolated worktree off `v2`:
explore → implement (reuse patterns) → self-verify build+tsc+test green → preserve the Frozen Contract (golden net
green) → adversarial review (`forge:quality-/architecture-/security-/performance-reviewer`), fix/refute Critical/Major
→ commit per step, stop pre-merge and report. The Tech Lead runs the dedicated review team + the preview gate + merges.

## 6. Branch model + preview-gate runbook
- `v2` = long-lived trunk. Workstream = branch `ws/<name>` off `v2` in its own worktree → work cycle → preview gate
  (if it touches resources/IAM) → merge via the integrator worktree (`git merge --ff-only` / `--no-ff --no-edit`).
  `v2` → `main` only at the ship decision, once rolled out to consumers.
- **Preview gate (read-only; Tech Lead runs it):** build the candidate in `cloud-infra-wt-v2trunk` (`yarn install`+`yarn build`);
  point each consumer's yarn `resolutions` `"@mutinex/cloud-infra": "portal:<v2trunk>"` + `yarn install`; then per stack
  `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" pulumi preview --diff`. Require **zero replace/delete**
  (modulo the known `1customer` mtx/dev drift + gcp 8.36→8.41 benign label/capability diffs). **`pulumi preview` ONLY — never up/apply/destroy/refresh.**

## 7. Key paths / auth
- **Integrator worktree:** `/Users/nik.zavgorodny/Dev/cloud-infra-wt-v2trunk` (on `v2`).
- **Consumer preview worktrees** (currently portal→v2trunk): dataos
  `/Users/nik.zavgorodny/Dev/monorepo-wt-v2-cloudrun-preview/dataos/infra` (stack `mutinex/dos/dev`); gcp-org
  `/Users/nik.zavgorodny/Dev/gcp-organization-wt-v2-preview/{mtx,mtx-org}` (stacks `mtx/dev`, `mtx-org/prd`).
- **Auth (verified):** pulumi=`nzav`, gcloud=`nik.zavgorodny@mutiny.group`, `GITHUB_PACKAGES_TOKEN` present.
- This handoff lives in BOTH the main checkout working tree (where a fresh session opens) AND committed on `v2` — keep both in sync.
- Stale/merged worktrees from the rework may linger (e.g. `-nf-gate`, `-canary`, old `-g*`/`-ws-*`); prune with
  `git worktree remove <path>` after confirming merged. Keep `-v2trunk` + the two consumer preview worktrees.
