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
> environment. No image is ever rebuilt per environment. When production
> succeeds, the pipeline **tags the commit on `main` with the next version**
> (`v1.4.1`), adds that version as an extra tag on the same images, and creates a
> GitHub Release.

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
5. **Releases are tags, created by the pipeline.** Every commit that reaches
   production gets a semantic version tag (`v1.4.0`, `v1.4.1`) on `main` — no
   release branch, and nobody tags by hand (see §3.1).

---

## 2. Branches

| Branch        | Purpose                                              | Who writes to it     |
| ------------- | ---------------------------------------------------- | -------------------- |
| `main`        | Single source of truth. Always releasable. Triggers the deployment pipeline. | Merge from PRs only |
| `feature/*`   | One short-lived change.                              | The author           |
| `helmcharts`  | GitOps config: `values-dev/stag/prod.yaml` with the live image tag per env. | The pipeline (deploy jobs) |

**Naming conventions**

- `feature/<short-desc>` — e.g. `feature/network-drilldown`
- `hotfix/<short-desc>` for urgent production fixes.

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

### 3.1 Release versions (`vMAJOR.MINOR.PATCH`)

The image tag says **which build**; the version says **which release**. A
version is only assigned once a build reaches production, in the last steps of
`deploy-prod`:

1. **Tag release on main** — finds the latest `v*` tag, computes the next
   version, and pushes an annotated git tag on the deployed commit
   (`Release v1.4.1 (image release-06.10.26-abc1234)`).
2. **Add release version to images** — adds `v1.4.1` as a second tag on the
   *same* backend and frontend images (`docker buildx imagetools create`, no
   rebuild — both tags share one digest).
3. **Create GitHub Release** — `v1.4.1` under **Releases**, with notes generated
   from the merged PRs plus the image tag and commit.
4. **Release summary** — a table on the run page: version, image tag, commit.

**Choosing the bump** — controlled by the merge commit message (with squash
merges, that is the PR title):

| Merge commit message | Previous | New |
|---|---|---|
| `Fix alert threshold` | v1.4.0 | **v1.4.1** (patch, default) |
| `Add reboot history page #minor` | v1.4.1 | **v1.5.0** |
| `New auth flow #major` | v1.5.0 | **v2.0.0** |
| first release (no tags yet) | — | **v0.0.1** |

**Rules**

- A commit that already has a `v*` tag keeps it (rollback re-runs don't create
  new versions).
- Commits not on `main` (e.g. a manual run from another branch) are deployed but
  not tagged; the run shows a warning.
- Tags pushed with `GITHUB_TOKEN` don't trigger workflows, so tagging never
  starts a new pipeline run.
- `values-prod.yaml` keeps the image tag (`release-…-<sha>`); Argo CD never
  needs the version.

**Where to see which version is which image**

| Place | What you see |
|---|---|
| Run page → **Summary** | `v1.4.1 \| release-06.10.26-abc1234 \| abc1234 \| production` |
| **Releases** → `v1.4.1` | `Image tag: release-06.10.26-abc1234` + PR list |
| `git show v1.4.1 --no-patch` | Tag message `Release v1.4.1 (image release-06.10.26-abc1234)` |
| `git tag --points-at abc1234` | `v1.4.1` (the image tag ends with the commit) |
| Artifactory | `v1.4.1` and `release-06.10.26-abc1234` show the same digest |

**`package.json` version** — not used for releases. The frontend is `private`
and never published, and the pipeline must not commit version bumps back to
`main` (that would trigger another run, fight branch protection, and change the
commit after its image was built). The git tag is the source of truth.

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
| `deploy-prod` | `deploy-staging` | **`production` environment approval** | Verifies the images exist, writes the **same** tag into `values-prod.yaml` → Argo deploys **production**. Then tags the commit `vX.Y.Z`, adds the version to the images, and creates a GitHub Release (§3.1). |

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
- Self-hosted runner `prov-wu2-...` online with `docker` (with `buildx`), `git`
  and `curl`.
- If the `helmcharts` branch has protection requiring PRs, the CI identity used
  by the deploy jobs must be on the ruleset **bypass list** (the jobs push
  directly).
- If a tag ruleset protects `v*` tags, the CI identity must be on its bypass list
  too (`deploy-prod` pushes release tags).
- Workflow permission `contents: write` (already set) — needed to push tags and
  create Releases.

---

## 6. End-to-end scenarios

### Scenario 1 — Normal release (happy path)
```
feature ─PR→ main ─build release-06.10.26-abc1234─► DEV (auto)
                              approve ─► STAGING (same tag)
                              approve ─► PROD    (same tag) ─► tag v1.4.0 + Release
```
1. PR into `main` (CodeQL + secret-scan + review) → merge. Add `#minor` /
   `#major` to the PR title if this is more than a patch.
2. Pipeline builds the image once → `deploy-dev` updates `values-dev.yaml` →
   Argo deploys dev.
3. `deploy-staging` pauses → a staging reviewer approves → it writes the same tag
   into `values-stag.yaml` → Argo deploys staging.
4. Validate → `deploy-prod` pauses → a production reviewer approves → it writes
   the identical tag into `values-prod.yaml` → Argo deploys prod → the job tags
   the commit `v1.4.0` and creates the GitHub Release.

### Scenario 2 — Bug found in **dev**
Staging/prod were never approved, so nothing to undo. **Fix forward on `main`** →
new pipeline run → new build → dev updates. The bad build simply never gets
staging approval.

### Scenario 3 — Bug found in **staging**
Prod is untouched (never approved). **Fix forward:** fix on `main` → new run →
dev → approve staging again. Don't approve the production stage of the bad run.

### Scenario 4 — **Hotfix** in production
No release branch — a hotfix is an urgent fix-forward:
1. `hotfix/<short-desc>` off `main` → fix + regression test → PR → merge.
   Pipeline builds a new image → dev.
2. Approve staging → validate.
3. Approve production → the job tags it `v1.4.1` (patch bump) automatically.

### Scenario 5 — Emergency **rollback** of production
The previous image is still in Artifactory — no rebuild.

1. Find the last good release under **Releases** (e.g. `v1.4.0`) and open the
   pipeline run that deployed it (linked from its run summary / commit).
2. **Re-run jobs** → re-run only `deploy-prod` → approve. It reuses that run's
   image tag, writes it back into `values-prod.yaml`, and Argo rolls prod back.
   The commit is already `v1.4.0`, so no new version is created.
3. Fallback (e.g. run older than GitHub's re-run window): commit the previous
   image tag into `values-prod.yaml` on `helmcharts` by hand.

Don't use **Run workflow** for a rollback — that starts `build` again and
produces a new image. Then fix forward via Scenario 4.

### Scenario 6 — Multiple people at once
Everyone merges small PRs into `main`; **dev always reflects the newest commit**.
Promote the run whose build you validated. Unfinished work stays dark via
vertical slicing / branch-by-abstraction (no feature flags — see §8).

### Scenario 7 — What is running where
- The latest **Release** / `v*` tag says the released version.
- `values-prod.yaml` on `helmcharts` shows the exact image tag live in prod
  (after a rollback this can be an older release than the latest tag).
- `git log v1.4.0..main --oneline` shows what's merged but not yet released.

---

## 7. Where testing / security gates apply

| Moment | What runs | Effect |
|--------|-----------|--------|
| Push to `feature/*` | Lint + unit tests + build | Fast feedback |
| **PR → `main`** | Full suite + build + **CodeQL** + secret push-protection | **Required** — blocks merge |
| `deploy-staging` / `deploy-prod` | `docker manifest inspect` (image-exists check) + **environment approval** | Blocks promoting a non-existent image / unapproved deploy |
| Deploy job writes values file | Argo CD sync | Deploys the env |
| After `deploy-prod` updates prod | Release tag + image version alias + GitHub Release | Records the version |

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
- [ ] For production: the PR title carries `#minor` / `#major` if the change is
      more than a patch (the release tag itself is created by the pipeline).
