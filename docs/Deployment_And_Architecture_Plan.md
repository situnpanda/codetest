# iTelemetry — Deployment, Repo & Branching Master Plan

> One document to understand **everything** about iTelemetry: how the code is organized,
> **why** it is split this way, how we branch, how we ship to **VMs** and **AKS**, and how any
> domain can graduate into its own microservice.
>
> Reading time ~10 min. If you read only one architecture doc, read this one.

---

## 0. TL;DR (the whole plan in 8 lines)

- **Folder structure:** feature/domain-first layout. Backend = 4 layers: `apis` (calling only), `domains` (alerting · metrics · metadata · chatops), `shared` (connectors), and a sibling `jobs/`.
- **Frontend:** Vite + React, organized by **feature** (not by tech).
- **Branching:** GitLab Flow — `main → staging → production` environment branches + a separate long-lived **`helm`** (GitOps) branch for deployment manifests.
- **Frontend & Backend:** deployed to **AKS** as **2 container images** (2 pods each).
- **Jobs:** remain on **VMs** (scheduled runtime).
- **Images:** built in CI → pushed to **JFrog Artifactory** (two images: `frontend`, `backend`).
- **AKS delivery:** **Argo CD** watches the `helm` branch and syncs the cluster (GitOps).
- **Why:** domains have **no cross-imports** and depend only on `shared/`, so any domain can later be peeled into its own service **without a rewrite**.

---

## 1. Repository layout

```
itelemetry/
├── backend/     Flask API + domain logic + shared connectors
├── frontend/    Vite + React single-page application (feature-based)
├── jobs/        Standalone batch/scheduled scripts (sibling of backend)
├── tests/       Automated tests, mirroring the backend domains
└── docs/        This documentation
```

`jobs/` sits **beside** `backend/` (not inside it) because jobs are a separate
deployable/runtime unit — they run out-of-process on a schedule, not inside the API.
They reach into the backend by adding `backend/` to `sys.path`.

---

## 2. Backend folder structure — how and why it is split this way

```
backend/
├── main.py            → entry point + composition root: builds the Flask app, registers blueprints/routes; WSGI target `main:app`
├── apis/              → "ONLY CALLING" web/routing layer (the front desk)
│     app.py           → composition root: Flask app, CORS, blueprint registration
│     alerts.py  analytics.py  infrastructure.py  application.py  chatops.py
│     network.py  metadata.py  misc.py  security.py
├── domains/           → business logic, grouped by FEATURE (the brain)
│     ├── alerts/      → alert rules + alertTriggers/
│     ├── chatops/     → chat integrations  ◀── natural first microservice
│     ├── metadata/    → reference/onboarding data fetched from the SQL database
│     └── metrics/     → CORE telemetry, grouped by area:
│                          analytics/ application/ infrastructure/ network/ security/
├── shared/            → connectors shared ACROSS domains
│     keyVault.py  dataBase.py  adx.py  logAnalytics.py  appinsightsLogger.py  utils/
└── static/
```

### 2.1 The four backend layers and their single responsibilities

| Layer | Responsibility | Rule |
| ----- | -------------- | ---- |
| `apis/` | **Calling only** — map HTTP endpoints to domain functions | No business logic; just wire requests to domains |
| `domains/` | Business logic per feature | Depends on `shared/` only; **never** imports another domain |
| `shared/` | Outside connections (KeyVault, SQL, ADX, Log Analytics, logging) | The single place Azure/data access lives |
| `jobs/` (sibling) | Scheduled batch work | Imports `domains` + `shared`; runs out-of-process |

### 2.2 The four domains (bounded contexts)

- **alerting** — alert rule read/update and alert-trigger evaluation.
- **metrics** — core telemetry: all data fetched from the data sources (servers, databases,
  file storage, network, load balancers, etc.). Contains `application/` and `infrastructure/`
  sub-slices that are tightly related and stay together as one context.
- **metadata** — reference/onboarding data fetched from the SQL database.
- **chatops** — chat-based operations integrations.

### 2.3 Why split it this way (the payoff)

| Property | What it gives you |
| -------- | ----------------- |
| **Calling layer isolated** (`apis/`) | HTTP concerns never leak into business logic; routes stay thin and swappable. |
| **Feature/domain slices** (`domains/<feature>/`) | Each feature is self-contained — find, change, and test it in one folder. |
| **Domains never import each other** | Verified: `alerting`, `metrics`, `metadata`, `chatops` have **zero cross-imports** — the ideal seam for splitting into services. |
| **Single connector layer** (`shared/`) | Swap DB/ADX/KeyVault or add mocks by editing only `shared/`; domains stay untouched. |
| **Jobs as a sibling** | Batch work deploys and scales independently of the API. |
| **Microservice-ready** | Any domain can be lifted into its own service with minimal surgery (see §6). |

**The one golden rule:** dependencies point **inward** —
`apis → domains → shared`. A domain never imports Flask or another domain.

---

## 3. Frontend folder structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx           → app bootstrap
    ├── App.jsx            → root component / routing
    ├── authConfig.js      → MSAL (Azure AD) configuration; redirectUri `/` (per-origin)
    ├── environment.js     → API base URL (same-origin `/api/` when hosted; `127.0.0.1:5000` locally)
    └── Components/
        ├── features/      → one folder per feature (clearly separated)
        ├── shared/        → reusable UI components + API client layer
        └── Static/        → static assets
```

**Why:** features are separated so teams can work independently; the `shared/` folder holds
cross-feature UI + the API client, and Vite gives fast dev/build with vendor code-splitting.

---

## 4. Branching strategy — the flow explained clearly

We follow **GitLab Flow**: short-lived work branches promoted one-directionally through
environment branches, plus a dedicated GitOps branch for deployment config.

### 4.1 Branches

| Branch | Type | Purpose | Who deploys from it |
| ------ | ---- | ------- | ------------------- |
| `main` | integration | Source of truth; always releasable | — |
| `staging` | environment | Pre-prod validation | Argo CD → AKS staging (frontend + backend) · CI → VM staging (jobs) |
| `production` | environment | Live | Argo CD → AKS prod (frontend + backend) · CI → VM prod (jobs) |
| `feature/*` | short-lived | New work, one per task | — |
| `hotfix/*` | short-lived | Urgent prod fix (branch off `production`, merge back up) | — |
| **`helm`** | **long-lived GitOps** | **Helm charts + per-env values for the AKS images (frontend, backend)** | **Argo CD watches this** |

### 4.2 The flow, step by step

```
feature/* ──PR──▶ main ──▶ staging ──(validate)──▶ production
                    │                                   │
                    └───────── image → JFrog ───────────┘
                                     │
                    helm branch: bump image tag per env
                                     │
                              Argo CD syncs AKS
```

1. Developer works on a `feature/*` branch → opens a PR into `main`.
2. **CI** runs lint + tests + build. For the **frontend** and **backend** it also runs
   `docker build` and pushes the two images to **JFrog Artifactory**.
3. Merging promotes code along environment branches: `main → staging → production`.
4. For the **AKS images** (frontend, backend), CI bumps their tags in the **`helm` branch**
   values file.
5. **Argo CD** watches the `helm` branch, detects the change, and **syncs** the new
   frontend/backend manifests+images into AKS (GitOps — the cluster always matches Git).
6. For **jobs** (VM-hosted), the existing environment-branch pipelines deploy to the VMs.

### 4.3 Why a separate `helm` branch

- **Separation of concerns** — app code changes don't churn deployment config and vice-versa.
- **Clean Argo CD source** — Argo CD points at exactly one branch/path; no app-commit noise.
- **Independent audit trail** — every production change is a visible commit in `helm`.
- **Safe rollback** — revert one commit in `helm` and Argo CD rolls the cluster back.
- **Least privilege** — people tuning deployments don't need to touch app code.

**Advantage:** what reaches production is the *exact* image validated in staging — no
"works on my machine" drift. The staging gate + Argo CD sync + easy revert keep releases
low-risk.

---

## 5. AKS deployment readiness

The **frontend** and **backend** run on **AKS** as **two container images** (2 pods each).
**Jobs** stay on **VMs** (scheduled runtime). This section states what is ready and what each
AKS image needs.

### 5.0 Topology

```
        CI (GitHub Actions)                     helm branch (GitOps)
  ┌───────────────────────────┐           ┌──────────────────────────┐
  │ lint · test · docker build │──image──▶│ values-*.yaml (2 tags)   │
  │  frontend + backend        │  to JFrog│  frontend + backend       │
  └───────────────────────────┘           └────────────┬─────────────┘
                                                        │ watches
                                              ┌─────────▼─────────┐
                                              │      Argo CD      │
                                              └─────────┬─────────┘
                                                        │ syncs
  ┌─────────────────────────────── AKS ──────────────────────────────┐
  │   ┌────────────────────┐        ┌────────────────────┐           │
  │   │  frontend image    │        │   backend image    │           │
  │   │   2 pods (SPA)      │──/api─▶│   2 pods (Flask)   │           │
  │   │   ingress: /        │        │   ingress: /api/*  │           │
  │   └────────────────────┘        └─────────┬──────────┘           │
  │      namespaces: staging / production · probes · HPA · KV CSI    │
  └───────────────────────────────────────────┼─────────────────────┘
                                               │ shared connectors
   ┌───────────────── VMs ─────────────┐   ┌───▼──────────────────────┐
   │  Jobs (schedulers)                │──▶│ SQL · ADX · KeyVault · LA │
   │  import backend/ on sys.path      │   │ (shared data sources)     │
   └───────────────────────────────────┘   └───────────────────────────┘
```

### 5.1 What lives where

| Component | Runtime | Ships via |
| --------- | ------- | --------- |
| **Frontend (React)** | **AKS** (2 pods) | JFrog `frontend` image + `helm` branch + Argo CD |
| **Backend (Flask API)** | **AKS** (2 pods) | JFrog `backend` image + `helm` branch + Argo CD |
| Jobs (schedulers) | **VM** | env-branch pipeline (unchanged) |
| **Future extracted domains** | **AKS** (2 pods each) | JFrog + `helm` branch + Argo CD |

### 5.2 The AKS pipeline (GitOps with Argo CD + JFrog)

```
1. CI builds the two service images         →  docker build (frontend, backend)
2. CI pushes them to JFrog Artifactory       →  jfrog.<org>/itelemetry/frontend:<sha>
                                                jfrog.<org>/itelemetry/backend:<sha>
3. CI updates both image tags in helm branch →  values-staging.yaml / values-production.yaml
4. Argo CD (watching helm branch) detects the change
5. Argo CD syncs → AKS rolls out new pods (2 replicas each, zero-downtime rolling update)
6. Health probes must pass or Argo CD/K8s auto-rolls back
```

> **Jobs are not part of this pipeline** — they continue to deploy to VMs via the existing
> environment-branch pipelines, importing `backend/` on `sys.path` as today.

### 5.3 Readiness checklist per service

| Requirement | Status / action |
| ----------- | ---------------------- |
| **Thin entry point** | ✅ `main.py` is the composition root and WSGI target — container `CMD` runs a WSGI server against `main:app`. |
| **12-factor config** | Ensure all secrets/URLs come from env vars / Key Vault, not hardcoded. |
| **Stateless process** | Move process-local caches (in-memory + `cachePaths` JSON files) to a shared store (e.g. Redis) or a mounted volume before running >1 pod. |
| **Health endpoints** | Add `/healthz` (liveness) and `/readyz` (readiness) for K8s probes. |
| **Dockerfile** | Add a `Dockerfile` per deployable (backend / each extracted service). |
| **Tests in CI** | `tests/` mirrors the domains; run `pytest -m "not integration"` as a merge gate before building images. |
| **Secrets** | Pull from **Azure Key Vault via the CSI driver** — never in the `helm` branch (PHI-safe). |
| **Helm chart** | `replicas: 2`, probes, resources, HPA, `secretproviderclass.yaml` on the `helm` branch. |
| **2 pods + HPA** | High availability, zero-downtime rolling deploys, load spreading; autoscale beyond 2 under load. |

### 5.4 Helm chart shape (on the `helm` branch)

Two charts, one per AKS image (`frontend` and `backend`):

```
helm/
├── charts/
│   ├── frontend/
│   │   ├── Chart.yaml
│   │   ├── templates/
│   │   │   ├── deployment.yaml           → replicas: 2, probes, resources
│   │   │   ├── service.yaml
│   │   │   ├── ingress.yaml              → public route to the SPA
│   │   │   └── hpa.yaml                  → autoscale on CPU/memory
│   │   └── values.yaml
│   └── backend/
│       ├── Chart.yaml
│       ├── templates/
│       │   ├── deployment.yaml           → replicas: 2, probes, resources
│       │   ├── service.yaml
│       │   ├── ingress.yaml              → /api/* route
│       │   ├── hpa.yaml                  → autoscale on CPU/memory
│       │   └── secretproviderclass.yaml  → Azure Key Vault CSI
│       └── values.yaml
├── values-staging.yaml                    → staging image tags + limits (both images)
├── values-production.yaml                 → prod image tags + limits (both images)
└── argocd/
    ├── frontend-app.yaml                   → Argo CD Application (frontend)
    └── backend-app.yaml                    → Argo CD Application (backend)
```

The frontend talks to the backend through the ingress `/api/*` route. `environment.js`
resolves the API base URL **same-origin** (`${window.location.origin}/api/`), so a single
frontend image works across dev/test/prod with no per-env rebuild, and it derives the
environment (development/staging/production) from the hostname:

| Host | Environment |
| ---- | ----------- |
| `itelemetry.devwu2.cloud.providence.org` | development |
| `itelemetry.testwu2.cloud.providence.org` | staging |
| `itelemetry.wu2.cloud.providence.org` | production |

---

## 6. Microservices migration readiness

The layout is a **modular monolith** built so any domain can become its own service.

### 6.1 Why it is ready

- **No cross-domain coupling** — `alerting`, `metrics`, `metadata`, `chatops` do **not**
  import each other. Coupling is only *inside* a domain (e.g., `metrics/application` ↔
  `metrics/infrastructure`), which stays together as one bounded context.
- **Single dependency direction** — every domain depends only on `shared/`. Package `shared/`
  as an internal library and each service bundles it.
- **Thin calling layer** — `apis/` just wires HTTP to domains, so splitting means giving each
  service its own Flask app + that domain's blueprints.

### 6.2 Feasibility by domain

| Domain | Split difficulty | Why |
| ------ | ---------------- | --- |
| `chatops` | Easy | Touches only `shared.dataBase` + auth — cleanest first cut. |
| `metadata` | Easy | Pure SQL reads/writes via `shared.dataBase`. |
| `alerts` | Medium | Self-contained; alertTriggers are batch-style (pair with jobs). |
| `metrics` | Medium–hard | Largest; ships as **one** service (its sub-slices are coupled), not four. |

### 6.3 The extraction recipe (mostly a move, not a rewrite)

1. Copy `domains/<feature>/` into a new service (`services/<feature>/`).
2. Give it a thin `apis/` entry point + its own `main.py`.
3. Turn `shared/` into a **pip-installable internal package** the service pins.
4. Distribute the relevant `main.py` inline routes to the owning service.
5. Add a `Dockerfile`, a Helm chart on the `helm` branch, and an Argo CD Application.
6. Front the services with an **API gateway** that routes `/api/*` by path to each service.
7. Serve the SPA and gateway on the **same host** (`/` → frontend, `/api` → gateway);
   `environment.js` already calls the backend same-origin, so no frontend change is needed.

### 6.4 Known migration blockers to resolve

- **Shared data store** — all domains hit the same SQL DB and ADX cluster. Deploying multiple
  services shares one datastore (pragmatic "shared database" pattern); full per-service data
  isolation is a larger, later effort.
- **URL prefixes overlap** — several blueprints share prefixes, so an API gateway keyed on path
  is required to disambiguate.
- **Process-local caches** — in-memory + `cachePaths` JSON files are per-process; some jobs
  write cache the API reads. Move to Redis or a shared volume before scaling out.
- **Auth** — `validateToken` lives in `shared/`, so every extracted service inherits it (no blocker).

### 6.5 Recommendation

Keep the app as a **modular monolith now** (the structure already supports it) and extract
incrementally, starting with the most independent domain (**chatops** or **metadata**), using
the same *folder-per-domain + shared-as-library* pattern. Build the **AI chatbot** as a slice
first, then split it into its **own AKS microservice** — AI workloads iterate fast and have a
memory/CPU-heavy scaling profile, so isolating it protects the core app.

---

## 7. Summary — how the pieces fit

| Aspect | Choice | Advantage |
| ------ | ------ | --------- |
| Backend structure | 4 layers: `apis` · `domains` · `shared` + sibling `jobs` | Thin calling layer, isolated features, single connector layer, clean seams |
| Domain boundaries | alerting · metrics · metadata · chatops (no cross-imports) | Each domain is independently extractable |
| Frontend structure | Vite + feature-based `Components/features` | Feature isolation, fast build, code-splitting |
| Branching | GitLab Flow + separate `helm` branch | Staged, gated, auditable releases; safe rollback |
| Image registry | JFrog Artifactory | Central, versioned, secure image store |
| AKS delivery | Argo CD (GitOps) | Git = source of truth; self-healing; revert-to-rollback |
| Availability | 2 pods + HPA + probes | HA, zero-downtime deploys, autoscaling |
| AKS workloads | Frontend + Backend (2 images, 2 pods each) | Elastic scaling, self-healing, GitOps delivery |
| VM workloads | Jobs (schedulers) | Keep current scheduled runtime; no forced migration |
| Future services | AKS microservices (extracted domains / chatbot) | Independent scale/release; clean seam from domain slices |
| Secrets | Azure Key Vault CSI | No secrets in Git (PHI-safe) |

**Bottom line:** the layered, domain-first layout gives clean seams to split services,
GitLab Flow + the `helm` branch give safe staged releases, and Argo CD + JFrog turn every AKS
deploy of the **frontend** and **backend** images into a reviewable, revertible Git operation.
**Jobs** keep running on VMs, and future microservices like the AI chatbot slot into AKS
without disturbing the core.
