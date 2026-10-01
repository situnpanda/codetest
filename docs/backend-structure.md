# Backend structure

```
backend/
├── main.py            Entry point + composition root: Flask app, CORS, blueprint registration, app-level routes
├── requirements.txt
├── swagger.json
├── apis/              "Only calling" — web/routing layer (one blueprint per functional group)
│   ├── alerts.py          Alert rules, watchlist, maintenance (/api/AlertRules/*, alert ops)
│   ├── analytics.py       Seasonal/pattern analysis + infra anomalies
│   ├── infrastructure.py  Server/database/file-storage/citrix metrics, patch, backup, Azure VM metrics
│   ├── application.py     Service/url/interface metrics, incidents, change requests, app reliability
│   ├── chatops.py         ChatOps early-warning + warning-event APIs (/api/chatInitiator/*)
│   ├── network.py         Network/moxa/load-balancer/crowdstrike metrics, DCX port health/watcher
│   ├── metadata.py        Filters, onboarding, governance, app health summary, support-group mapping
│   ├── misc.py            System ops, user/performance metrics, infra events/alerts, service requests
│   └── security.py        Credential inventory (/api/credentialInventory)
├── domains/           Business logic grouped by domain (mirrors the apis/ groups)
│   ├── alerts/        Alert rules + alertTriggers/
│   ├── chatops/       Chat integrations
│   ├── metadata/      SQL-backed reference/onboarding data
│   └── metrics/       Telemetry business logic, grouped by area:
│       ├── analytics/       Seasonal/pattern analysis
│       ├── application/     Service/url/interface, incidents, map view
│       ├── infrastructure/  Server/db/file-storage/citrix, Azure VM, user & resource compliance, pages/
│       ├── network/         Network/moxa/load-balancer/crowdstrike
│       └── security/        Credential inventory
├── shared/            Connectors shared across domains
│   ├── keyVault.py
│   ├── dataBase.py
│   ├── adx.py
│   ├── logAnalytics.py
│   ├── appinsightsLogger.py
│   └── utils/
└── static/
```

## Rules

- `apis/` performs routing only — it wires HTTP endpoints to domain functions. Routes are grouped into 9 blueprint files by functional area (see `docs/APIs_list.csv` `updated grouping` column). Each file defines a single blueprint with no `url_prefix`; every route uses its full path.
- `domains/` holds business logic. Domains depend on `shared/`, never on each other.
- `shared/` is the common connector layer (KeyVault, SQL, ADX, Log Analytics, logging).
- `main.py` is the composition root: it builds the Flask app, registers all blueprints/routes, and is the WSGI target (`main:app`).
