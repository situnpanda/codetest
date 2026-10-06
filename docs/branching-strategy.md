# Branching Strategy & Release Flow — iTelemetry

This document defines how we branch, review, build, and deploy code using a
**pure trunk-based** strategy with **build-once / promote-the-same-image**
delivery and **staged, approval-gated deployments**, on top of a single
**GitHub Actions** pipeline + **Argo CD**.

> TL;DR: Work on a **short-lived** `feature/*` branch → PR into `main` (CodeQL +
> secret push-protection + review must pass) → merge. Merging triggers one
> pipeline that **builds the image once** and deploys it through **dev →
> staging → production** in sequence. Dev is automatic; **staging and
> production each pause for a human approval** (GitHub Environment required
> reviewers). Each stage writes the *same* image tag into that environment's
> Helm values file on the `helmcharts` branch, and **Argo CD** rolls the
> environment. No image is ever rebuilt per environment. Releases and hotfixes
> are **git tags** on `main`.

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
   immutable tag** `release-<dd.mm.yy>-<sha>`. That exact tag is what runs in
   dev, then staging, then prod — never rebuilt.
3. **Environments are driven by Helm values, not branches.** "Deploy" =
   change the `image.tag` in an env's values file. Argo CD watches `helmcharts`
   and applies whatever tag is written there.
4. **Promotion is gated by an environment approval.** Staging and production
   each pause until a required reviewer approves the deployment job.
5. **Releases are tags.** `v1.4.0`, `v1.4.1` tagged on `main` — no release
   branch.

---

## 2. Branches

| Branch        | Purpose                                              | Who writes to it     |
| ------------- | ---------------------------------------------------- | -------------------- |
| `main`        | Single source of truth. Always releasable. Triggers the deployment pipeline. | Merge from PRs only |
| `feature/*`   | One short-lived change.                              | The author           |
| `helmcharts`  | GitOps config: `values-dev/stag/prod.yaml` with the live image tag per env. | The pipeline (deploy jobs) |

**Naming conventions**

- `feature/<ticket>-<short-desc>` — e.g. `feature/ITEL-142-network-drilldown`
- `hotfix/<ticket>-<short-desc>` for urgent production fixes.

**Trunk-based rules for `feature/*` branches**

- Keep them **short-lived** — merge within 1–2 days, then delete.
- Keep PRs **small** (ideally < 400 lines) and focused on one change.
- Rebase/pull from `main` frequently; never let `main` stay red.

---

## 3. The image tag (build-once identity)

The `build` job is the only one that builds. It tags both images with a single
shared tag:

```
release-<dd.mm.yy>-<short_sha>      e.g.  release-06.10.26-abc1234
```

- Environment-neutral (no `dev-`/`stag-`/`prod-` prefix) so the **same** tag can
  move across environments unchanged.
- Immutable — a given tag always refers to the same bytes in Artifactory.
- Promotion never rebuilds; each deploy stage only repoints an env's values file
  at this existing tag (verified first with `docker manifest inspect`).

---

## 4. The pipeline

Everything lives in a **single workflow**,
[`.github/workflows/deploy.yaml`](../.github/workflows/deploy.yaml). `helmcharts`
is a **branch of the same repo**, so the default `GITHUB_TOKEN` can push to it.

| Job | Depends on | Gate | What it does |
|-----|-----------|------|--------------|
| `build` | — | — | Builds backend + frontend **once** (tag `release-<dd.mm.yy>-<sha>`), pushes to Artifactory, exposes the tag as a job output. |
| `deploy-dev` | `build` | none (automatic) | Writes the tag into `values-dev.yaml` → Argo deploys **dev**. |
| `deploy-staging` | `deploy-dev` | **`staging` environment approval** | Verifies the images exist, writes the **same** tag into `values-stag.yaml` → Argo deploys **staging**. |
| `deploy-prod` | `deploy-staging` | **`production` environment approval** | Verifies the images exist, writes the **same** tag into `values-prod.yaml` → Argo deploys **production**. |

Because every deploy job reads the tag from `needs.build.outputs.image_tag`,
staging and production always deploy the **exact image dev validated** — there is
no separate tag input and no rebuild.

---

## 5. Approvals (GitHub Environments)

Approval is configured in the **repo UI**, not in the YAML. The gate comes from
each job's `environment:` key:

1. Repo → **Settings** → **Environments** → create `dev`, `staging`,
   `production` (names must match the `environment:` values exactly).
2. On **`staging`** and **`production`**, enable **Required reviewers** and add
   the people/teams who approve that stage. (Optionally add a **Wait timer** or
   **Deployment branch** restriction.)
3. `dev` needs no reviewers — it exists for deployment history/visibility.

When the pipeline reaches a gated job it **pauses** and shows a *Review
deployments* prompt; the run only continues after a listed reviewer approves.

Prerequisites checklist:
- Environments `dev`, `staging`, `production` created, with required reviewers on
  `staging` and `production`.
- `helmcharts` branch exists with `values-dev.yaml`, `values-stag.yaml`,
  `values-prod.yaml`, each containing `tag:` lines for backend and frontend.
- Secret `JFROG_TOKEN_SP` present (build + registry login).
- Self-hosted runner `prov-wu2-...` online with `docker` and `git`.
- If the `helmcharts` branch has protection requiring PRs, the CI identity used
  by the deploy jobs must be on the ruleset **bypass list** (the jobs push
  directly).

---

## 6. End-to-end scenarios

### Scene 1 — Normal release (happy path)
```
feature ─PR→ main ─build release-06.10.26-abc1234─► DEV (auto)
                              approve ─► STAGING (same tag)
            tag v1.4.0,       approve ─► PROD    (same tag)
```
1. PR into `main` (CodeQL + secret-scan + review) → merge.
2. Pipeline builds the image once → `deploy-dev` updates `values-dev.yaml` →
   Argo deploys dev.
3. `deploy-staging` pauses → a staging reviewer approves → it writes the same tag
   into `values-stag.yaml` → Argo deploys staging.
4. Validate → tag `v1.4.0` on `main` → `deploy-prod` pauses → a production
   reviewer approves → it writes the identical tag into `values-prod.yaml` → Argo
   deploys prod.

### Scene 2 — Bug found in **dev**
Staging/prod were never approved, so nothing to undo. **Fix forward on `main`** →
new pipeline run → new build → dev updates. The bad build simply never gets
staging approval.

### Scene 3 — Bug found in **staging**
Prod is untouched (never approved). **Fix forward:** fix on `main` → new run →
dev → approve staging again. Don't approve the production stage of the bad run.

### Scene 4 — **Hotfix** in production
No release branch — a hotfix is an urgent fix-forward:
1. `hotfix/<ticket>` off `main` → fix + regression test → PR → merge. Pipeline
   builds a new image → dev.
2. Approve staging → validate.
3. Tag `v1.4.1` on `main` → approve production.

### Scene 5 — Emergency **rollback** of production
The previous image is still in Artifactory — no rebuild. Re-run the pipeline for
the last known-good commit (or manually set the previous tag in
`values-prod.yaml`) and approve prod; Argo rolls prod back in minutes. Then fix
forward via Scene 4.

### Scene 6 — Multiple people at once
Everyone merges small PRs into `main`; **dev always reflects the newest commit**.
Promote the run whose build you validated. Unfinished work stays dark via
vertical slicing / branch-by-abstraction (no feature flags — see §8).

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
| `deploy-staging` / `deploy-prod` | `docker manifest inspect` (image-exists check) + **environment approval** | Blocks promoting a non-existent image / unapproved deploy |
| Deploy job writes values file | Argo CD sync | Deploys the env |

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

- [ ] The image tag exists in Artifactory (the deploy job's `manifest inspect` step passed).
- [ ] The source environment (dev for staging; staging for prod) was validated.
- [ ] The required environment reviewer approved the deployment.
- [ ] For production: a release tag `vX.Y.Z` has been cut on `main`.
