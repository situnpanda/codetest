# Backend structure

```
backend/
├── main.py            Thin entry point (imports apis.app:app)
├── requirements.txt
├── setup.py
├── swagger.json
├── apis/              "Only calling" — web/routing layer
│   ├── app.py         Composition root: Flask app, CORS, blueprint registration
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
- `main.py` stays thin: it only imports and runs the Flask app from `apis/app.py`.
