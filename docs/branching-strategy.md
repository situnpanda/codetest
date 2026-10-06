# Branching Strategy & Release Flow — iTelemetry

This document defines how we branch, review, build, and deploy code using a
**pure trunk-based** strategy with **build-once / promote-the-same-image**
delivery and **GitOps PR-gated promotions**, on top of **GitHub Actions** +
**Argo CD**.

> TL;DR: Work on a **short-lived** `feature/*` branch → PR into `main` (CodeQL +
> secret push-protection + review must pass) → merge. Merging **builds the image
> once** and auto-deploys it to **dev**. The *same* image is then promoted to
> **staging** and **production** by opening a Pull Request against the
> `helmcharts` branch; a Code-Owner approves + merges that PR, and **Argo CD**
> rolls the environment. No image is ever rebuilt per environment. Releases and
> hotfixes are **git tags** on `main`.

---

## 1. Core principles

iTelemetry is a continuously-released platform with two deployable images
(`backend/` Flask API, `frontend/` Vite app) plus `jobs/` batch scripts. The
three environments exist as Helm value files on the **`helmcharts` branch**:
`values-dev.yaml`, `values-stag.yaml`, `values-prod.yaml`.

1. **One branch: `main`.** It is the single source of truth and is always
   releasable. No `develop`, `staging`, or `production` branches.
2. **Build once, promote the same artifact.** The image is built a single time
   when a commit lands on `main`, tagged with an **environment-neutral,
   immutable tag** `v<run>-<date>-<sha>`. That exact tag is what runs in dev,
   then staging, then prod — never rebuilt.
3. **Environments are driven by Helm values, not branches.** "Deploy" =
   change the `image.tag` in an env's values file. Argo CD watches `helmcharts`
   and applies whatever tag is written there.
4. **Promotion is a reviewed PR.** Staging/prod values only change through a
   Pull Request that a Code-Owner approves and merges. That merge **is** the
   approval gate.
5. **Releases are tags.** `v1.4.0`, `v1.4.1` tagged on `main` — no release
   branch.

---

## 2. Branches

| Branch        | Purpose                                              | Who writes to it     |
| ------------- | ---------------------------------------------------- | -------------------- |
| `main`        | Single source of truth. Always releasable. Builds the image + auto-deploys dev. | Merge from PRs only |
| `feature/*`   | One short-lived change.                              | The author           |
| `helmcharts`  | GitOps config: `values-dev/stag/prod.yaml` with the live image tag per env. | CI (dev) + promotion PRs |

**Naming conventions**

- `feature/<ticket>-<short-desc>` — e.g. `feature/ITEL-142-network-drilldown`
- Promotion branches (created by the workflows): `promote/staging-<tag>`,
  `promote/production-<tag>`.

**Trunk-based rules for `feature/*` branches**

- Keep them **short-lived** — merge within 1–2 days, then delete.
- Keep PRs **small** (ideally < 400 lines) and focused on one change.
- Rebase/pull from `main` frequently; never let `main` stay red.

---

## 3. The image tag (build-once identity)

The **development** workflow is the only one that builds. It tags both images
with a single shared tag:

```
v<run_number>-<YYYYMMDD>-<short_sha>      e.g.  v128-20261006-abc1234
```

- Environment-neutral (no `dev-`/`stag-`/`prod-` prefix) so the **same** tag can
  move across environments unchanged.
- Immutable — a given tag always refers to the same bytes in Artifactory.
- Promotion never rebuilds; it only repoints an env's values file at an existing
  tag (verified with `docker manifest inspect`).

---

## 4. The workflows

All live in `.github/workflows/` (iTelemetry repo). `helmcharts` is a **branch of
the same repo**, so the default `GITHUB_TOKEN` can push to it and open PRs.

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| [`development-deployment.yaml`](../.github/workflows/development-deployment.yaml) | push to `main` | Builds backend + frontend **once** (tag `v<run>-<date>-<sha>`), pushes to Artifactory, auto-updates `values-dev.yaml` → Argo deploys **dev**. |
| [`staging-deployment.yaml`](../.github/workflows/staging-deployment.yaml) | manual (`workflow_dispatch`) | **No build.** Resolves the tag (input, or the one currently in dev), verifies the images exist, opens a **PR** updating `values-stag.yaml`. |
| [`production-deployment.yaml`](../.github/workflows/production-deployment.yaml) | manual (`workflow_dispatch`) | **No build.** Resolves the tag (input, or the one currently in staging), verifies the images exist, opens a **PR** updating `values-prod.yaml`. |

The promotion workflows take an optional `image_tag` input. Left blank, staging
promotes **the tag currently in dev**, and production promotes **the tag
currently in staging** — so by default you always move the validated artifact one
step forward.

---

## 5. Approvals (GitOps PR gate)

Approval is **code review on the `helmcharts` values files**, enforced by
[`.github/CODEOWNERS`](https://github.com) on the `helmcharts` branch:

| Values file | Required approver |
|-------------|-------------------|
| `values-dev.yaml` | light ownership (CI pushes directly) |
| `values-stag.yaml` | a release reviewer |
| `values-prod.yaml` | a release manager |

On the `helmcharts` branch, protection requires: PR before merge, **review from
Code Owners**, dismiss stale approvals, no direct pushes.

> **Dev auto-push exception:** the `development-deployment.yaml` workflow pushes
> to `helmcharts` **directly** (dev is ungated). Because the branch otherwise
> requires PRs, the CI identity used for that push must be on the ruleset
> **bypass list** (e.g. a dedicated GitHub App). Staging/prod promotions are
> **not** on the bypass list, so they always require an approved PR.

Prerequisites checklist:
- Settings → Actions → General → **Allow GitHub Actions to create and approve
  pull requests** = ON (promotion PRs need it).
- Secret `JFROG_TOKEN_SP` present (build + registry login).
- Self-hosted runner `prov-wu2-...` online with `docker`, `git`, `gh`.

---

## 6. End-to-end scenarios

### Scene 1 — Normal release (happy path)
```
feature ─PR→ main ─build v128─► DEV (auto)
                     promote ─► PR on values-stag.yaml ─approve/merge─► STAGING (same v128)
            tag v1.4.0, promote ─► PR on values-prod.yaml ─approve/merge─► PROD (same v128)
```
1. PR into `main` (CodeQL + secret-scan + review) → merge.
2. CI builds `v128` once → `values-dev.yaml` auto-updates → Argo deploys dev.
3. Run **Staging Deployment** → it opens a PR → reviewer merges → Argo deploys staging with `v128`.
4. Validate → tag `v1.4.0` on `main` → run **Production Deployment** → release manager merges the PR → Argo deploys prod with the identical `v128`.

### Scene 2 — Bug found in **dev**
Nothing was promoted, so nothing to undo. **Fix forward on `main`** → new build
`v129` → dev updates. The bad `v128` simply never gets a promotion PR.

### Scene 3 — Bug found in **staging**
Prod is untouched. Either:
- **Roll staging back:** run Staging Deployment with the previous good tag → merge its PR, **or**
- **Fix forward:** fix on `main` → new tag → dev → promote again. Close the bad promotion PR unmerged.

### Scene 4 — **Hotfix** in production
No release branch — a hotfix is just an urgent fix-forward:
1. `hotfix/<ticket>` off `main` → fix + regression test → PR → merge. CI builds `v130` → dev.
2. Smoke-check dev → promote to staging (PR, merge) → validate.
3. Tag `v1.4.1` on `main` → promote to production (PR, release-manager merge).

### Scene 5 — Emergency **rollback** of production
The previous image is still in Artifactory — no rebuild. Run **Production
Deployment** with the last known-good tag (e.g. `v127`); merge the one-line PR →
Argo rolls prod back in minutes. Then fix forward via Scene 4.

### Scene 6 — Multiple people at once
Everyone merges small PRs into `main`; **dev always reflects the newest commit**.
Pick the validated tag to promote. Unfinished work stays dark via vertical
slicing / branch-by-abstraction (no feature flags — see §8).

### Scene 7 — What is running where
- The **tag** (`v1.4.0`) says the released version.
- `values-prod.yaml` on `helmcharts` shows the exact tag live in prod.
- Compare the prod tag against `main` to see what's new but unreleased.

---

## 7. Where testing / security gates apply

| Moment | What runs | Effect |
|--------|-----------|--------|
| Push to `feature/*` | Lint + unit tests + build | Fast feedback |
| **PR → `main`** | Full suite + build + **CodeQL** + secret push-protection | **Required** — blocks merge |
| Promotion PR (stag/prod) | `docker manifest inspect` (image-exists check) + Code-Owner review | Blocks promoting a non-existent image / unapproved change |
| Merge of promotion PR | Argo CD sync | Deploys the env |

---

## 8. Incomplete work without feature flags

Every merge to `main` must leave it releasable. Keep unfinished work dark by:

- **Vertical slicing, merged in order:** backend endpoint → service/DB logic →
  frontend wiring. The user-facing entry point lands in the final, smallest PR,
  so earlier merges are inert.
- **Branch by abstraction** for migrations — introduce an interface, keep the
  old implementation wired until the new one is complete, then switch the single
  wiring point and delete the old path. (Exactly how the `_TokenConnection`
  factory let old and new DB-auth paths coexist in
  [`backend/shared/dataBase.py`](../backend/shared/dataBase.py) during the AAD
  managed-identity migration.)

---

## 9. Definition of "ready to merge" (into `main`)

- [ ] CI (frontend + backend) is green.
- [ ] CodeQL and secret push-protection pass with no new high/critical findings.
- [ ] At least one reviewer approved.
- [ ] New/changed behavior has tests.
- [ ] No secrets, PHI, or PII in code, tests, or comments.
- [ ] Branch is up to date with `main`.

## 10. Definition of "ready to promote" (staging/prod)

- [ ] The image tag exists in Artifactory (the workflow's `manifest inspect` step passed).
- [ ] The source environment (dev for staging; staging for prod) was validated.
- [ ] The promotion PR is approved by the required Code-Owner.
- [ ] For production: a release tag `vX.Y.Z` has been cut on `main`.
