# cloud-infra v2 Rework — Session Handover / Operating Prompt

> **This document IS your prompt. Read it top to bottom and adopt it.** It lets a fresh session
> resume the program with zero loss. The authoritative *technical* record (Frozen Contract,
> Trap List, validated label map, preview results) is `docs/v2-redesign-notes.md` — read it too.
> Last updated: 2026-06-27. **Current trunk: branch `v2` @ `0c13459`, 493 tests green.**
>
> ⚠️ **Where the real work lives:** the program runs on the long-lived **`v2`** branch, NOT
> `main`. Use the integrator worktree **`/Users/nik.zavgorodny/Dev/cloud-infra-wt-v2trunk`**
> (checked out on `v2`) for merges/builds, and spawn feature-lead worktrees off `v2`.

---

## 0. START HERE — the immediate next task

The user chose: **finish the access-matrix STRUCTURAL collapse, then stop** (defer DX2 + docs).

**Task: collapse the access-matrix dispatch indirection** in `src/core/access-matrix/`:
- `builders/` — the `IamBuilderRegistry` + `registry-initializer` + 10 per-type builder classes are a static dispatch table dressed as an extensibility framework. Collapse to ONE function with a `switch` on the Pulumi type token (~12 cases), each case doing the exact same `new gcp.*IAMMember(resourceName, {...})` call it does today.
- `principals/principal-factory.ts` — flatten the resolver-registry wrapper into a plain ordered resolver function (the 4 resolver bodies in `principal-types.ts` carry the real logic — keep them).

**This is STATE-SENSITIVE — it rewrites the LIVE IAM-creation path.** Unlike everything merged so far, golden F3 alone is NOT sufficient proof. The output (every IAM resource's type token + logical name + creation order) MUST be byte-identical. Hard requirements:
- **Preserve Trap 1:** the `deduplicate()` no-op in `principal-factory.ts` (`typeof principal === 'string' ? principal : principal`) — do NOT "fix" it (would drop/rename bindings).
- **Preserve Trap 4:** config→case→rule principal/rule iteration ORDER (feeds `principal-N`/`role-N` fallback names).
- **Preserve the IAM name formula** `${componentName}:${safeRole}:${principalIdentifier}` + 100-char truncation (golden F3), and the 12 type-token→constructor mappings (currently in `registry-initializer.ts` + each builder's `build()`).
- **MANDATORY real preview gate before merge** (§6 runbook): the dispatch rewrite must show ZERO IAM replace/delete on dataos/dev + gcp-org mtx/dev + mtx-org/prd. Chunk into small per-commit runs (drop-resilience, see §1).

Suggested chunking: (1) builder registry → switch; (2) principal-factory flatten. Each its own feature-lead worktree off `v2`, golden F3 + full suite green, then the preview gate, then merge.

**After this lands: STOP and hand back.** DX2 (single/bulk) is deferred (state-sensitive, low value). Docs/test sprawl is low-priority. The next real milestone is the SHIP decision (§7) — the user's call.

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

## 4. CURRENT STATE (v2 @ 0c13459, 493 green — all PREVIEW-ONLY, no apply ever run)
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

## 5. ACCESS-MATRIX COLLAPSE — see §0 (this is the active task)
(Design + hard requirements are in §0. The `naming.ts` name-first foundation, `childOpts`/
`nestedChildOpts`/`withLabels` base, and the golden net are all already on `v2`.)

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
- **DEFERRED:** DX2 (collapse single/bulk — state-sensitive bulk-key, Trap 6, low value); docs/test sprawl.
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
