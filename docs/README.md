# iTelemetry — Documentation

This folder contains the documentation for the **iTelemetry** (CRCA Services) platform.

## Contents

| Document | Description |
|----------|-------------|
| [before-after-comparison.md](before-after-comparison.md) | Before vs after comparison for branching, environments, hosting, and folder architecture |
| [Deployment_And_Architecture_Plan.md](Deployment_And_Architecture_Plan.md) | Master plan: branching, folder structure & rationale, AKS & microservice readiness |
| [architecture.md](architecture.md) | High-level architecture, layers, and data flow |
| [backend-structure.md](backend-structure.md) | Backend folder layout and domain boundaries |
| [frontend-structure.md](frontend-structure.md) | Frontend (Vite) feature-based structure |
| [jobs.md](jobs.md) | Batch jobs, scheduling, and how they resolve backend modules |
| [testing.md](testing.md) | Test layout, running tests, and conventions |
| [local-development.md](local-development.md) | Running the backend, frontend, and jobs locally |

## Repository layout

```
itelemetry/
├── backend/     Flask API + domain logic + shared connectors
├── frontend/    Vite + React single-page application
├── jobs/        Standalone batch/scheduled scripts
├── tests/       Automated tests (mirrors the backend domains)
└── docs/        This documentation
```
