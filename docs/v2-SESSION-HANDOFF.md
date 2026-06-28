# cloud-infra v2 Rework — Session Handover / Operating Prompt

> **This document IS your prompt. Read it top to bottom and adopt it.** It lets a fresh session
> resume the program with zero loss. The authoritative *technical* record (Frozen Contract,
> Trap List, validated label map, preview results) is `docs/v2-redesign-notes.md` — read it too.
> Last updated: 2026-06-27. **Current trunk: branch `v2` @ `e73b21a`, 450 tests green.**
>
> ⚠️ **Where the real work lives:** the program runs on the long-lived **`v2`** branch, NOT
> `main`. Use the integrator worktree **`/Users/nik.zavgorodny/Dev/cloud-infra-wt-v2trunk`**
> (checked out on `v2`) for merges/builds, and spawn feature-lead worktrees off `v2`.

---

## 0. START HERE — the immediate next task

✅ **Access-matrix STRUCTURAL collapse is DONE & merged to `v2` (@ `9a70a70`).** Both chunks landed:
- (1) `IamBuilderRegistry` + 10 per-type builder classes + `registry-initializer`'s IAM half → ONE
  `createIamBinding(resourceType, params)` switch in `builders/iam-binding.ts` (11 cases; secret +
  regionalSecret share a case). `registry-initializer.ts` keeps the LIVE `ResourceRegistry` half
  (Trap 2); `isInitialized()` now checks ResourceRegistry only. Call site `policy-rule-processor.ts`
  routes through `createIamBinding`. `index.ts` dropped the `IamBuilderRegistry`/`IamBuilder` exports.
- (2) `principal-factory.ts` resolver Map/initialize/register → a frozen ordered `RESOLVERS` list
  (string→output→matrix-object→resource). Trap 1 `deduplicate()` no-op preserved VERBATIM; resolver
  bodies in `principal-types.ts` untouched; `clear()` now a no-op; public API behavior-identical.
- **Verified:** 493/493 tests green (incl. golden F1–F4), tsc + build clean, every constructor call
  cross-checked byte-identical to the deleted builders, and the **real preview gate PASSED** — ZERO
  IAM replace, ZERO IAM create-renames on all three stacks (dataos/dev, mtx/dev, mtx-org/prd incl.
  PROD); the only IAM op anywhere was the known-benign `1customer` SA-IAMMember delete in mtx/dev.
  Net −314 LOC. (Gate detail logged in §9c of `docs/v2-redesign-notes.md`.)

✅ **Deferred cleanup + DX2 also DONE & merged (@ `e73b21a`).**
- **Cleanup:** deleted the 9 `dx1-*.equivalence.test.ts` name-first scaffolding files (golden net F1–F4 +
  `dx1-args-no-collision` kept); fixed stale docs across ~20 component READMEs + `core`/`access-matrix`
  READMEs (meta-first→name-first examples, removed-framework refs) and stale access-matrix code comments.
  Test count 493 → 440. No production behavior touched (no gate needed).
- **DX2 (name-first for the two BULK components):** added name-first overloads to `CloudInfraBulkBucket`
  + `CloudInfraBulkAccount` (+ a `resolveMeta(names: string[], …)` overload); meta-first kept `@deprecated`
  and byte-unchanged. Pinned by +10 equivalence tests (440 → 450). **Preview gate PASSED** — diffs byte-
  identical to baseline on all 3 stacks; the `CloudInfraBulkAccount`-fed IAM bindings (Trap 6 bulk-key, live
  in mtx/dev + dataos/dev) all stayed `unchanged`. (Gate detail in §9d/§9e of the redesign notes.)
- **NOT done — deliberately:** the structural "kill single/bulk → `names.map(n => new Single(n))`" collapse
  (redesign-notes Move 2). Each `Single` is its own `CloudInfraComponent` URN node; bulk is ONE node with N
  children — mapping over singles restructures the URN tree → mass replace. Destructive, low value; left
  alone. Name-first parity (the actual DX win) is achieved without it.

✅ **Docs pass DONE & merged (@ `349ded8`); `v2` pushed to `origin/v2`.** All 23 READMEs updated +
verified against source: name-first as the primary construction example (3 gaps filled —
backendservice/instance/certificatemap), an Outputs section everywhere documenting the v2 flat wire
(`getFlatOutputs()`), `core/output` rewritten around the flat wire, `core/reference` re-led with the
`get(name,{type?,domain?})` API (legacy getters marked `@deprecated`). The pass also removed pre-existing
**fabricated** docs (a non-existent `validation.ts` section + `ReferenceError` in `core/README`, and
`getTagValue()` calls in the tag README). A follow-up sweep then **converted residual meta-first code
examples to name-first** in every name-first-capable README (`new CloudInfraMeta(` now survives ONLY in
core/meta's own doc, the meta-first-only trio folder/pam/tag, the raw `record()` example in core/output,
and a single labeled `overrideNamingRules` meta-only demo) — and corrected the false "gcpProject has no
name-first equivalent" prose (`gcpProject` → name-first config `project:`). `docs/v2-MIGRATION.md` holds
the v1→v2 consumer runbook.

**→ Chosen rollout strategy (user, 2026-06-28):** keep `v2` as a long-lived BRANCH (do NOT merge to
`main` yet); publish **preview/prerelease npm packages** off `v2` (a preview dist-tag that auto-updates
consumers wired to it); then upgrade a **low-risk consumer first — the admin-app repo — as the canary**
before the org/monorepo stacks. Still PREVIEW-ONLY until a human-gated `pulumi up` per stack. Next
concrete step toward this: wire a preview-publish CI workflow off `v2` (the package builds CJS/ESM/DTS
green; 450 tests). See `docs/v2-MIGRATION.md` §4–§5.

The original collapse spec + traps are retained in §5 for audit; the work cycle / merge model below
(§§1–3, 6) still governs any further structural change.

### Standing directives from the user (carry these)
- **You have MERGE AUTHORITY.** "Keep merging everything as long as you are happy." Merge into `v2` on a clean gate WITHOUT asking per-merge; escalate only genuine ambiguity/risk. (This supersedes any "gate every merge with the user" language below.)
- **Applying to real infra / publishing the package = explicit USER decision.** Everything is PREVIEW-ONLY; never `pulumi up/apply/destroy/refresh`.
- **Delegate implementation to feature-lead agents** (you orchestrate; keep your context lean). Each runs the work cycle in its OWN worktree and stops pre-merge.
- **Chunk + commit per component/step** — big single-agent runs hit ~18-min connection drops and lost uncommitted work twice. Small scopes that commit frequently are the fix.
- Your "happy" bar before merge: build + `tsc --noEmit` + full `test` incl. golden net green; reviewers' Critical/Major fixed-or-refuted; zero-replace preview for structural changes; your own diff check.

---

## 1. WHO YOU ARE
**Technical Lead for the @mutinex/cloud-infra v2 rework, personally accountable for output quality.**
You direct and verify; you do not type production code. You command feature-lead agents (§2),
verify against the definition-of-done, run the preview gate yourself, and merge on a clean gate.
Trust nothing unverified — agent reports are claims; check the diff/preview.

## 2. THE TEAM + WORK CYCLE
Every workstream → a **feature-lead agent** (`general-purpose` or `forge:implementer`) owning ONE
workstream end-to-end in an **isolated worktree**. Paste this into every feature-lead prompt:
> You are a feature lead. Own this to a verifiably-shippable state. Report as DATA. Work ONLY in
> your worktree; never touch main checkouts. Cycle: (1) explore; (2) implement, reuse patterns;
> (3) self-verify `yarn build`+`tsc --noEmit`+`yarn test` green; (4) preserve the Frozen Contract
> (notes §2 F1–F4 + Trap List) — golden net stays green; (5) adversarial review via
> `forge:quality-reviewer`+`forge:architecture-reviewer`, fix/refute every Critical/Major;
> (6) COMMIT per step to your feature branch, do NOT merge/push, stop pre-merge and report
> (incl. anything needing a real `pulumi preview`).

Forge agents: `forge:implementer`, `forge:quality-reviewer`, `forge:architecture-reviewer`,
`forge:security-reviewer`, `forge:performance-reviewer`, `Explore`. The Tech Lead runs the
preview gate (needs creds agents lack) and does the merge.

## 3. BRANCH MODEL
- **`v2`** = long-lived trunk (seeded from `experiment/v2-dataos-canary`). Current HEAD `0c13459`.
- Workstream = branch `ws/<name>` off `v2` (NOT `v2/<name>` — nested refs blocked) in its own
  worktree → work cycle → preview gate (if structural) → merge to `v2`. Merge via the integrator
  worktree `cloud-infra-wt-v2trunk` (`git merge --ff-only ws/<name>` or `--no-ff --no-edit`).
- `v2` → `main` only when complete AND rolled out to consumers (the ship decision, §7).
- **This handoff doc lives in BOTH** the main checkout working tree (where a fresh session opens)
  AND committed on `v2`. Keep both updated.

## 4. CURRENT STATE (v2 @ 6422996, pushed to origin/v2, 745 green — all PREVIEW-ONLY, no apply ever run)
> Active program: `docs/v2-SIMPLIFICATION-PLAN.md`. Waves 1–3 DONE, gated zero-replace, and
> review-team-cleared (all Critical/Major fixed in the Wave-3 consolidated fix pass, incl. the two
> Waves-1–2 Majors: `AccessMatrixCases` back-compat restored + `/org` lazy config default). Next: Wave 4
> (`CloudInfraService` capstone — additive; NO IAM on it). DEFERRED to a future major (can't be shimmed
> losslessly): output-wire collapse + meta-first/getter hard-removal — they stay dual/deprecated.
MERGED & validated:
- **Phase 1** — all ~20 components converted to `pulumi.ComponentResource`; uniform labels
  (per-child opt-in, merged into args — no transform inheritance); non-destructive aliases
  (`childOpts` auto root-alias; `nestedChildOpts` for inherited children). Zero-replace verified
  on dataos/dev + gcp-org mtx/dev + mtx-org/prd (incl. PROD).
- **Phase 2 (DX)** — name-first construction on EVERY component
  `new X("name",{domain,location,prefix,naming,...config})` (meta-first kept `@deprecated`;
  arg-identical, preview-gated on dataos); `ref.get("name").field` reference API (positional
  stack, domain optional, cross-type scan, `ReferenceWithoutDomain` folded in, old getters
  `@deprecated`); flat outputs (`getFlatOutputs()` dual-emit; nested wire frozen; flat reader).
- **Phase 3 (partial)** — dead `Config` singleton removed (constants inlined at exact values:
  `maxResourceNameLength=100`, `certificateMaxLength=32`); hand-rolled LRU → plain `Map`
  (`generateSafeName` byte-identical); deps trimmed to `@pulumi/*`+`zod`; ~833 LOC of dead
  access-matrix code excised (live IAM path byte-unchanged).
- **Frozen-Contract golden net** (`src/core/__tests__/frozen-contract/`): F1 names (all 5 formulas
  + zonal), F2 aliases + 12 ALB tokens, F3 IAM-name formula + 100-truncation, F4 getIdentifier.
  This is the regression guard — it MUST stay green.
- **Access-matrix dispatch collapse (DONE, §0)** — `IamBuilderRegistry`+10 builders+`registry-initializer`
  IAM half → single `createIamBinding` switch (`builders/iam-binding.ts`); `principal-factory` resolver
  Map → frozen ordered list. ResourceRegistry (Trap 2) + Trap 1 dedup no-op preserved. Real preview
  gate PASSED zero-replace on all 3 stacks; net −314 LOC.

## 5. ACCESS-MATRIX COLLAPSE — DONE (retained for audit)
**Completed & merged** — see §0 for the landed result and §6 runbook for the gate that proved it.
Original spec (now satisfied): collapse the `IamBuilderRegistry` + `registry-initializer` IAM half +
10 per-type builders to ONE `switch` function on the Pulumi type token, each case doing the same
`new gcp.*IAMMember(resourceName, {...})`; flatten `principal-factory.ts`'s resolver-registry to a
plain ordered resolver. Hard requirements that were honored: Trap 1 `deduplicate()` identity no-op
kept verbatim; Trap 4 iteration order; IAM name formula `${componentName}:${safeRole}:${principalIdentifier}`
+ 100-char truncation (golden F3); ResourceRegistry (Trap 2) left LIVE & untouched; byte-identical
output proven via the mandatory zero-replace preview gate.

## 6. PREVIEW-GATE RUNBOOK (Tech Lead runs this; read-only)
1. Snapshot+build the candidate: `git -C /Users/nik.zavgorodny/Dev/cloud-infra worktree add --detach <path> <branch-or-v2>` ; `yarn install` + `yarn build` (confirm `dist/`). (Use `--detach` if the branch is checked out elsewhere.)
2. Repoint consumers' yarn `resolutions` `"@mutinex/cloud-infra": "portal:<that worktree>"` + `yarn install` in:
   - dataos: `/Users/nik.zavgorodny/Dev/monorepo-wt-v2-cloudrun-preview/dataos/infra` (stack `mutinex/dos/dev`)
   - gcp-org: `/Users/nik.zavgorodny/Dev/gcp-organization-wt-v2-preview/{mtx,mtx-org}` (stacks `mtx/dev`, `mtx-org/prd`)
3. `NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main pulumi preview --diff` per stack.
   For access-matrix: confirm ZERO IAM-resource replace/delete. (Known pre-existing drift: a
   `1customer` IAMMember delete in mtx/dev — NOT migration; gcp provider 8.36→8.41 benign diffs.)
4. `pulumi preview` ONLY. NEVER up/apply/destroy/refresh.

## 7. DEFERRED + THE SHIP DECISION (user's call)
- **DONE (was deferred):** DX2 name-first for the two BULK components (gate-passed, byte-identical);
  docs/test sprawl cleanup. See §0. The structural single/bulk *class collapse* (map-over-single) was
  deliberately NOT done — it's URN-restructuring/destructive, low value (§0).
- **SHIP (pending, user-authorized only):** publish `v2` + migrate consumers (gcp-organization
  mtx/mtx-org/mtx-apps; monorepo pkgs growthos/platform/dataos) via a codemod. **Codemod sharp-edges:**
  (1) `gcpProject` → config `project:` field; (2) **`location` foot-gun** — name-first fuses
  naming-location & deploy-region, so a consumer setting deploy region via `config.location` (meta
  location-less) MUST DROP `location` when porting or the resource renames+REPLACES; escape hatch =
  the `@deprecated` meta-first overload; (3) bulk classes have no name-first (DX2). Pin gcp provider
  for any apply (drift caveat). Repo consolidation into `monorepo/lib/cloud-infra` (+ `@mutinex`→
  `@mutiny-group` rename) is also deferred until v2 stabilizes.

## 8. KEY PATHS / AUTH / WORKTREES
- **Frozen Contract + Traps + validated label map + preview results:** `docs/v2-redesign-notes.md`
  (§2 F1–F4, §3 Trap List incl. Trap 1 dedup/Trap 2 ResourceRegistry-live/Trap 4 order/Trap 6
  bulk-key, §8 label-inheritance rule, §9/§9b/§9c real preview results).
- **Auth (verified present):** pulumi=`nzav`, gcloud=`nik.zavgorodny@mutiny.group`, `GITHUB_PACKAGES_TOKEN`.
- **Integrator worktree:** `cloud-infra-wt-v2trunk` (on `v2`) — merge/build here.
- **Prune these merged/stale worktrees** (`git -C /Users/nik.zavgorodny/Dev/cloud-infra worktree remove <path>`):
  `-ws-golden -ws-net2 -ws-ab -dx1 -dx3 -sweep1 -sweep2 -heavya -heavyb -p3clean -amdead -nf-gate -g1..-g5 -org-project -org-rest -canary -v2`
  (keep `-v2trunk` and the two consumer preview worktrees). Verify each is merged before removing.

## 9. AUDIT TRAIL (condensed)
- Build order that worked: Phase-1 golden net first (safety net) → base redesign under it → name-first
  foundation (DX1a: Bucket proof) → name-first sweeps (simple/multi/heavy, per-component commits) →
  name-first preview gate PASS → DX3 reference → DX4 flat outputs → Phase-3 cleanup → access-matrix
  dead-code (~833 LOC). Every structural change passed a real zero-replace preview incl. prod.
- Test count grew 293 → 495 (golden + equivalence) then 493 after removing 2 dead-code tests.
- Detailed per-workstream history + the two name-first sharp-edges are in `docs/v2-redesign-notes.md`.
