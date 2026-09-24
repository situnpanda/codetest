# Architecture

iTelemetry v3 is organized as a **modular monolith** with clear domain boundaries,
designed so any domain can later be extracted into its own microservice.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│                     frontend (Vite + React)              │
│         feature-based UI, calls the backend REST API      │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (/api/*)
┌───────────────────────────▼─────────────────────────────┐
│  backend/apis        "only calling" web/routing layer     │
│  (Flask app, blueprints, request/response handling)       │
├───────────────────────────────────────────────────────────┤
│  backend/domains     business logic, grouped by domain     │
│    ├── alerting      alert rules + triggers                │
│    ├── metrics       core telemetry (all data-source data) │
│    ├── metadata      reference data from SQL DB            │
│    └── chatops       chat integrations                      │
├───────────────────────────────────────────────────────────┤
│  backend/shared      connectors shared across domains      │
│    KeyVault · SQL · ADX/Kusto · LogAnalytics · logging     │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Azure KeyVault      Azure Data Explorer   SQL Server
                       (ADX/Kusto)           / Log Analytics
```

The `jobs/` scripts run out-of-process (scheduled), importing `backend/domains`
and `backend/shared` to push/refresh data.

## Domain boundaries

- **alerting** — alert rule read/update and alert trigger evaluation.
- **metrics** — core telemetry: everything fetched from the data sources
  (servers, databases, file storage, network, load balancers, etc.).
- **metadata** — reference/onboarding data fetched from the SQL database.
- **chatops** — chat-based operations integrations.

Domains do not import one another; they only depend on `shared/`. This keeps
each domain independently extractable into a microservice.
