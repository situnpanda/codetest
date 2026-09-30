# Backend structure

```
backend/
├── main.py            Entry point + composition root: Flask app, CORS, blueprint registration, app-level routes
├── requirements.txt
├── swagger.json
├── apis/              "Only calling" — web/routing layer (VSA route slices)
│   ├── alerts.py
│   ├── application.py
│   ├── infrastructure.py
│   ├── metadata.py
│   ├── operations.py
│   ├── summary.py
│   └── system.py
├── domains/           Business logic grouped by domain
│   ├── alerting/      Alert rules + AlertTriggers/
│   ├── metrics/       Core telemetry (*Perf blueprints) + application/ + infrastructure/
│   ├── metadata/      SQL-backed reference/onboarding data
│   └── chatops/       Chat integrations
├── shared/            Connectors shared across domains
│   ├── keyVault.py
│   ├── dataBase.py
│   ├── ADX.py
│   ├── LogAnalytics.py
│   ├── appinsights_logger.py
│   └── utils/
└── static/
```

## Rules

- `apis/` performs routing only — it wires HTTP endpoints to domain functions.
- `domains/` holds business logic. Domains depend on `shared/`, never on each other.
- `shared/` is the common connector layer (KeyVault, SQL, ADX, Log Analytics, logging).
- `main.py` is the composition root: it builds the Flask app, registers all blueprints/routes, and is the WSGI target (`main:app`).
