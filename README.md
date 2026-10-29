# iTelemetry

iTelemetry (CRCA Services) is an Azure-backed telemetry and operations platform. It collects
infrastructure, application, and network telemetry, normalizes it in a Python backend, and
surfaces it through a React dashboard so operational teams can make decisions from one place.

> **New to this repo?** Start with [docs/iTelemetry-overview.md](docs/iTelemetry-overview.md), then
> [docs/project-structure.md](docs/project-structure.md). The full documentation index is at
> [docs/README.md](docs/README.md).

## How the pieces fit together

```
                 ┌──────────────┐
  Azure / infra  │   jobs/      │  scheduled scripts collect + push telemetry
  SQL / monitors ──►  (ingestion) │  into Azure SQL, ADX, Log Analytics
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │  backend/     │  Flask API (apis/ → domains/ → shared/)
                 │  (processing) │  exposes REST endpoints under /api/*
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │  frontend/    │  Vite + React SPA, served at /
                 │  (presentation)│ renders dashboards, charts, operational views
                 └───────────────┘
```

- **`jobs/`** keep the platform current: they collect, transform, and push data into Azure SQL / ADX.
- **`backend/`** is a modular monolith: `apis/` (routing only) → `domains/` (business logic) →
  `shared/` (Azure SQL, ADX, Key Vault, Log Analytics connectors).
- **`frontend/`** is view-focused: all backend calls go through `Components/shared/APIs/`, never a
  direct `fetch`.
- Both apps are served from the **same host** through the AKS ingress (`/` → frontend, `/api/*` →
  backend). See [docs/project-structure.md](docs/project-structure.md) for the full layout and rules.

### `apis/` vs `domains/` — who does what

These are two different layers inside `backend/`, split by responsibility, not by feature. Every
request flows **`apis/` → `domains/` → `shared/`**, never the other way, and never `apis/` straight
to `shared/`.

| Layer | Role | Allowed to contain | Not allowed to contain |
|-------|------|---------------------|--------------------------|
| `apis/` | **Routing / transport.** One Flask blueprint per functional group (e.g. `alerts.py`, `infrastructure.py`, `network.py`). Declares the URL (`/api/...`), reads the request (query/body/headers), calls one `domains/` function, and returns its result as JSON. | `@blueprint.route(...)` handlers, request parsing, HTTP status codes | SQL/Kusto queries, calculations, business rules, direct calls to `shared/` |
| `domains/` | **Business logic.** Grouped by subject area (`alerts/`, `chatops/`, `metadata/`, `metrics/...`). Implements the actual rules: querying data via `shared/` connectors, transforming/aggregating results, enforcing domain rules. | Data access via `shared/`, calculations, validation, orchestration across multiple `shared/` calls | Flask route decorators, HTTP-specific code (that belongs in `apis/`) |

Example — `GET /api/AlertRules`:

1. `apis/alerts.py` defines the route, reads any query params, and calls a function in
   `domains/alerts/`.
2. `domains/alerts/` runs the actual logic (e.g. reads the rules from SQL via `shared/dataBase.py`,
   applies filtering), and returns plain data.
3. `apis/alerts.py` serializes that data as the JSON response.

**Rule of thumb:** if you're writing a SQL/ADX query or a calculation, it belongs in `domains/`. If
you're parsing a request or shaping an HTTP response, it belongs in `apis/`. Domains never call each
other directly — shared logic between domains moves to `shared/`.

## Repository layout

| Path | What it is |
|------|------------|
| [backend/](backend) | Flask API — routing, domain logic, Azure connectors |
| [frontend/](frontend) | Vite + React single-page application |
| [jobs/](jobs) | Scheduled scripts that collect data into ADX / SQL |
| [tests/](tests) | Automated tests (backend unit + integration, frontend) |
| [docs/](docs) | Project documentation (start here for anything not covered below) |
| [.github/workflows/deploy.yaml](.github/workflows/deploy.yaml) | CI/CD pipeline: build once → dev → staging → prod |

## Quick start

```powershell
# backend — http://127.0.0.1:5000 (Swagger UI at /swagger)
cd backend
pip install -r requirements.txt
$env:DEPLOYMENT_ENV = "development"   # development | staging | production
python main.py

# frontend — http://localhost:3000 (expects backend on 127.0.0.1:5000)
cd frontend
npm install
npm start

# tests — from the repo root
python -m pytest -c tests/pytest.ini
```

## Documentation map

| Document | Read it for |
|----------|-------------|
| [docs/iTelemetry-overview.md](docs/iTelemetry-overview.md) | What the platform does, the tech stack, end-to-end data flow |
| [docs/project-structure.md](docs/project-structure.md) | Backend/frontend folder layout, layer rules, local run commands |
| [docs/feature-development-guide.md](docs/feature-development-guide.md) | Step-by-step process for adding or changing a feature |
| [docs/branching-strategy.md](docs/branching-strategy.md) | Trunk-based branching, build-once image, approval-gated deploys, release tags |
| [docs/jobs.md](docs/jobs.md) | Batch jobs, scheduling, how they import backend modules |
| [docs/testing.md](docs/testing.md) / [tests/README.md](tests/README.md) | Test layout, running tests, conventions |
| [docs/new-vs-old-architecture.md](docs/new-vs-old-architecture.md) | Before vs after: branching, environments, IaaS → AKS hosting |

## Core conventions (see docs for full detail)

- **Environment comes only from `DEPLOYMENT_ENV`** (backend) / hostname (frontend) — never hardcode
  environment or backend URLs. A test fails if a hardcoded backend URL appears outside `environment.js`.
- **Backend:** `apis/` route only, business logic lives in `domains/`, Azure/SQL/ADX connectors live in
  `shared/`. Domains never depend on each other directly.
- **Frontend:** one folder per feature under `Components/features/`, reusable UI in
  `Components/shared/`, all API calls through `Components/shared/APIs/`.
- **Branching:** single `main` branch, short-lived `feature/*` branches, build-once image promoted
  through dev → staging → prod with approval gates. See
  [docs/branching-strategy.md](docs/branching-strategy.md).
- **Security:** no hardcoded secrets or PHI/PII anywhere in code, tests, or comments. Credentials come
  from Azure Key Vault / managed identity.

## Tech stack

Python (Flask), React (Vite + MUI), Azure SQL Database, Azure Data Explorer (Kusto/ADX), Azure Log
Analytics, Azure Key Vault, Application Insights / Azure Monitor, Microsoft Entra ID (MSAL),
Docker, Helm, Kubernetes (AKS), Nginx, Argo CD, GitHub Actions.

See [docs/iTelemetry-overview.md](docs/iTelemetry-overview.md#tech-stack) for the complete list.
