# iTelemetry — Documentation

This folder contains the documentation for the **iTelemetry** (CRCA Services) platform.

## New here? Read in this order

1. [iTelemetry-overview.md](iTelemetry-overview.md): what the platform does, the tech stack, and how it fits together
2. [project-structure.md](project-structure.md): where everything lives in `backend/` and `frontend/`, and how to run them
3. [feature-development-guide.md](feature-development-guide.md): step by step, how to add or change a feature
4. [branching-strategy.md](branching-strategy.md): how code gets from your branch to production

## Contents

| Document | Description |
|----------|-------------|
| [iTelemetry-overview.md](iTelemetry-overview.md) | Business problem, system flow, frontend/backend/data layers, deployment, tech stack |
| [project-structure.md](project-structure.md) | Backend and frontend folder layout, layer rules, and local run commands |
| [feature-development-guide.md](feature-development-guide.md) | Step-by-step process for adding or changing a feature (which files, which functions, tests, checklist) |
| [branching-strategy.md](branching-strategy.md) | Trunk-based branching, build-once image, approval-gated pipeline (dev → staging → prod), automatic release tags `vX.Y.Z` |
| [jobs.md](jobs.md) | Batch jobs, scheduling, and how they import backend modules |
| [testing.md](testing.md) | Test layout, running tests, and conventions (see also [tests/README.md](../tests/README.md)) |
| [new-vs-old-architecture.md](new-vs-old-architecture.md) | Before vs after: branching, environments, IaaS → AKS hosting, folder architecture (diagram: `new-vs-old-architecture.drawio`) |

## Repository layout

```
itelemetry-v3/
├── .github/workflows/deploy.yaml   Pipeline: build once → dev → staging → prod, then release tag
├── backend/     Flask API (apis/) + business logic (domains/) + connectors (shared/)
├── frontend/    Vite + React single-page application
├── jobs/        Scheduled scripts that collect data into ADX / SQL
├── tests/       Automated tests (backend unit + integration, frontend)
└── docs/        This documentation
```

## Quick commands

```powershell
# backend (http://127.0.0.1:5000)
cd backend; c:/iTelemetry6/venv/Scripts/python.exe main.py

# frontend (http://localhost:3000)
npm --prefix frontend run dev

# tests (from itelemetry-v3/)
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini
```
