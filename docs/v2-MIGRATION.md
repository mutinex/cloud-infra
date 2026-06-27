# @mutinex/cloud-infra v1 → v2 Migration Plan

> Status: **v2 is feature-complete on branch `v2` and PREVIEW-ONLY** — no consumer has been
> migrated and no `pulumi up/apply` has been run. This document is the runbook for the SHIP
> decision. Publishing the package and applying to real infra are explicit per-stack go/no-go
> calls. The technical record is `docs/v2-redesign-notes.md`; program state is
> `docs/v2-SESSION-HANDOFF.md`.

## 1. What v2 changes for consumers

v2 is an **additive, non-destructive** rework. Every v1 call site keeps working (meta-first
construction and the old reference getters are retained, marked `@deprecated`). The migration is
about adopting the new ergonomics and is designed to be **zero-replace** — validated by real
`pulumi preview` on `dataos/dev`, `mtx/dev`, and `mtx-org/prd` (incl. PROD) at every phase.

| Area | v1 | v2 (recommended) | v1 still works? |
|---|---|---|---|
| Construction | `new X(new CloudInfraMeta({name,domain,…}), config)` | `new X("name", {domain, location, prefix, naming, ...config})` | Yes — meta-first `@deprecated` |
| References | type-specific getters | `ref.get("name").field` (positional stack, domain optional) | Yes — old getters `@deprecated` |
| Outputs | nested only | `getFlatOutputs()` (dual-emit; nested wire frozen) | Yes |
| Resource model | mixed | every component is a `pulumi.ComponentResource` | n/a (aliases make it in-place) |
| Bulk components | meta-first only | name-first `new CloudInfraBulkX(["a","b"], {domain, ...})` | Yes — meta-first `@deprecated` |

**Why it's non-destructive:** components became `ComponentResource`s with children nested under
them, but each child carries a root-alias (`childOpts`/`nestedChildOpts`) back to its v1 URN, so an
upgrade is an in-place update, not a replace.

## 2. The four sharp edges (codemod foot-guns)

A naive find-replace will break things. These are the cases that change a resource's NAME (→
replace) or fail to compile:

1. **`gcpProject` → `project:`** — the v1 meta `gcpProject` field becomes the component config
   `project:` field. There is no name-first equivalent of `gcpProject` on the naming args.

2. **`location` foot-gun (the dangerous one).** Name-first FUSES naming-location and deploy-region
   into the single `location` arg. A v1 consumer that set its deploy region via `config.location`
   while keeping the *meta* location-less must **drop `location` when porting to name-first** — or
   the generated name gains a location segment and the resource **renames + REPLACES**. Escape
   hatch: keep those call sites on the `@deprecated` meta-first overload (byte-identical to v1).

3. **Bulk name array order is URN-load-bearing for accounts.** `CloudInfraBulkAccount`'s component
   node label is `inputNames.join('-') + '-accounts'` (insertion order, *not* sorted —
   `CloudInfraBulkBucket` sorts its keys). When porting a bulk account to name-first, **preserve the
   exact array order** of the original meta `name: [...]` or the component node URN changes. Child
   resource URNs are keyed by input name and are unaffected either way. (The input-name keys also
   embed into access-matrix IAM binding names — Trap 6 — so do not rename/re-key them.)

4. **Three components are meta-first ONLY — do not convert.** `CloudInfraFolder`,
   `CloudInfraEntitlement` (pam), and `CloudInfraTag` have no name-first overload (their sole
   constructor takes a `CloudInfraMeta`). Leave them meta-first.

## 3. Provider pinning

Previews ran on gcp provider **8.41** against state deployed with **8.36**, producing benign
in-place drift (`configuredCapabilities: null`, extra custom-role permissions, label updates).
**Pin the gcp provider** for any apply and **re-run the zero-replace gate against the pinned
version** — the gate result is only valid for the provider the apply actually uses.

## 4. Per-stack rollout

**Chosen approach (2026-06-28):** `v2` stays a long-lived branch (NOT merged to `main` yet). Publish
**preview/prerelease packages** off `v2` under a dedicated dist-tag (e.g. `next`/`preview`) so opted-in
consumers auto-pick-up new builds. Migrate a **low-risk consumer first — the admin-app repo — as the
canary**, gate it clean, then proceed to the org/monorepo stacks below. (TODO: a preview-publish CI
workflow off `v2`; the package already builds CJS/ESM/DTS green with 450 tests.)

Consumers (in suggested order — simplest/most-isolated first, each fully gated before the next):

- **admin-app** — first canary (low risk).

| Stack | Path | Pulumi stack |
|---|---|---|
| gcp-org mtx | `gcp-organization/mtx` | `mtx/dev` (+ `mtx/prd`) |
| gcp-org mtx-org | `gcp-organization/mtx-org` | `mtx-org/prd` (PROD) |
| gcp-org mtx-apps | `gcp-organization/mtx-apps` | `mtx-apps/dev` |
| monorepo dataos | `monorepo/dataos/infra` | `mutinex/dos/dev` (+ prod) |
| monorepo growthos / platform | `monorepo/*/infra` | per-package |

For EACH stack:
1. Bump `@mutinex/cloud-infra` to the published v2 version.
2. Apply the codemod (§2 sharp edges). Start by leaving everything meta-first (compiles, zero diff),
   then convert call sites incrementally.
3. **Gate (read-only):** `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" pulumi preview
   --diff`. Require **zero replace/delete** of any resource (modulo known pre-existing drift, below).
   See `docs/v2-SESSION-HANDOFF.md` §6 for the full portal-based gate runbook.
4. Only on a clean gate, with the provider pinned, do a human-reviewed `pulumi up`.

**Known pre-existing drift (NOT migration-caused):** a `1customer` workload-identity
`serviceaccount/IAMMember` shows as a delete in `mtx/dev`. It is v1 config drift (confirmed against a
baseline v1 preview), independent of v2 — resolve or accept it separately before the mtx apply.

`CloudInfraRepository`-fed access-matrix exists in `mtx/prd` but was not previewable from the dev
stacks — preview it specifically before that apply.

## 5. Publishing v2 (prerequisite for the above)

1. Land `v2` → `main` (or publish from `v2`) and cut a v2 release of `@mutinex/cloud-infra`.
2. Confirm the package builds clean (`yarn build` → CJS/ESM/DTS) and `yarn test` is green (currently
   450 tests).
3. Consumers must run with `NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main` when the lib
   is consumed via a `portal:` symlink (local testing); a normal published install does not need it.

## 6. Explicitly deferred (not part of this migration)

- **Repo consolidation** into `monorepo/lib/cloud-infra` and the `@mutinex` → `@mutiny-group` package
  rename — deferred until v2 has stabilized in consumers.
- The structural single/bulk **class collapse** (`names.map(n => new Single(n))`) — intentionally not
  done; it restructures URNs and would force mass replacement (see handoff §0 / redesign-notes §9e).
