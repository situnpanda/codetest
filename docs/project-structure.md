# Project structure (backend + frontend)

The app has two deployable parts served from the **same host** through the AKS ingress:

| Path    | Served by | Tech |
|---------|-----------|------|
| `/`     | `frontend/` | Vite + React 18 + MUI 5 single-page app (nginx in the container) |
| `/api/*` | `backend/`  | Flask API (`main:app`) |

For a step-by-step "where do I put my code" walkthrough, see
[feature-development-guide.md](feature-development-guide.md).

---

## Backend

```
backend/
├── main.py            Composition root: Flask app, CORS, Swagger UI, blueprint registration, WSGI target (main:app)
├── requirements.txt
├── swagger.json       Served at /swagger.json, UI at /swagger
├── Dockerfile
├── apis/              Routing only: one blueprint per functional group
│   ├── alerts.py          Alert rules, watchlist, maintenance (/api/AlertRules/*, alert ops)
│   ├── analytics.py       Seasonal/pattern analysis + infra anomalies
│   ├── infrastructure.py  Server/database/file-storage/citrix metrics, patch, backup, Azure VM metrics
│   ├── application.py     Service/url/interface metrics, incidents, change requests, app reliability
│   ├── chatops.py         ChatOps early-warning + warning-event APIs (/api/chatInitiator/*)
│   ├── network.py         Network/moxa/load-balancer/crowdstrike metrics, DCX port health/watcher
│   ├── metadata.py        Filters, onboarding, governance, app health summary, support-group mapping
│   ├── misc.py            System ops, user/performance metrics, infra events/alerts, service requests,
│   │                      GET /api/environment (resolved env + ADX target, used by the frontend console check)
│   └── security.py        Credential inventory (/api/credentialInventory)
├── domains/           Business logic grouped by domain (mirrors the apis/ groups)
│   ├── alerts/        Alert rules (read/update/support) + alertTriggers/
│   ├── chatops/       Chat integrations (service.py)
│   ├── metadata/      SQL-backed reference/onboarding data (app summary, component list, onboarding updates)
│   └── metrics/       Telemetry business logic, grouped by area:
│       ├── analytics/       Seasonal/pattern analysis
│       ├── application/     Service/url/interface, incidents, downtime, map view
│       ├── infrastructure/  Server/db/file-storage/citrix, Azure governance, user & resource compliance, pages/
│       ├── network/         Network/moxa/load-balancer/crowdstrike
│       └── security/        Credential inventory
├── shared/            Connectors and helpers used by more than one domain
│   ├── environment.py       ENVIRONMENT constant, resolved from DEPLOYMENT_ENV (defaults to development)
│   ├── adx.py               ADX client; cluster chosen per ENVIRONMENT (readFromADX, connectToADX)
│   ├── dataBase.py          Azure SQL / Snowflake connections (AAD token auth)
│   ├── keyVault.py          Key Vault secret access (connectToKeyVault)
│   ├── logAnalytics.py      Log Analytics query + ingestion
│   ├── appinsightsLogger.py App Insights / Azure Monitor logging, @log_performance()
│   ├── sessionTokenAction.py, auth.py   Azure AD token validation
│   ├── filters.py, hospitalList.py, anomaliesList.py   Shared lookup data
│   ├── cachePaths.py        Paths of the JSON cache files
│   ├── convertTimeZone.py   PST/IST <-> UTC helpers
│   ├── userActivityLogging.py, variables.py
└── static/
```

### Backend rules

- **`apis/` routes only.** It reads the request, calls a domain function and returns the result. No queries or business logic.
- **9 blueprints, no `url_prefix`.** Each file in `apis/` defines one blueprint and every route uses its full path (`/api/...`). New blueprints must be registered in `main.py`.
- **`domains/` holds business logic.** Domains depend on `shared/`, never on each other. If two domains need the same code, move it to `shared/`.
- **`shared/` is the connector layer** for Key Vault, SQL, ADX, Log Analytics and logging.
- **Environment comes only from `DEPLOYMENT_ENV`** through `shared.environment.ENVIRONMENT`. Never derive it from hostnames or other variables. The ADX cluster and App Insights tagging follow it; Key Vault, Log Analytics and SQL are shared across environments.
- **Namespace packages:** there are no `__init__.py` files. Import with the lowercase module path (`from shared.adx import readFromADX`). The pods run on Linux, so casing must match the file name exactly.

### Backend commands

```powershell
cd backend
pip install -r requirements.txt
$env:DEPLOYMENT_ENV = "development"   # development | staging | production
python main.py                         # http://127.0.0.1:5000 (Swagger UI at /swagger)
```

---

## Frontend

```
frontend/
├── index.html
├── package.json        Scripts: start / dev / build / preview
├── vite.config.js      Dev port 3000, shims for retired libraries, .js treated as JSX, vendor chunks
├── nginx.conf          Container web server config
├── Dockerfile
└── src/
    ├── main.jsx            Bootstrap: MSAL + App Insights providers, render, then logBackendEnvironment()
    ├── App.jsx             Root component and routing (pages are lazy() loaded)
    ├── authConfig.js       MSAL (Azure AD) configuration
    ├── environment.js      Single source of truth for environment + backend URL:
    │                         getEnvironment() (from hostname), getUrl() (same-origin /api/ when hosted,
    │                         http://127.0.0.1:5000/api/ locally), logBackendEnvironment()
    ├── ErrorBoundary.js
    ├── shims/              Drop-in replacements for retired packages (wired up in vite.config.js)
    ├── assets/, Fonts/     Static assets
    └── Components/
        ├── features/       One folder per feature/page (AuditReport/, AlertManager/, ChatOps/, ...)
        │   └── Header/Header.jsx   Sidebar menu: parallel arrays icons / routes / pageDevStatus / routesLabels
        ├── shared/         Reusable UI components (charts, tables, cards, modals, ...)
        │   └── APIs/
        │       ├── fetchAPIs.jsx   Read calls (requestJson, getApiErrorMessage, baseUrl = getUrl())
        │       └── updateAPIs.jsx  Write calls (sends the Bearer token)
        └── Static/         Static assets
```

### Frontend rules

- **One folder per feature** under `Components/features/`. Put reusable pieces in `Components/shared/`.
- **All backend calls go through `shared/APIs/`.** Components never call `fetch` directly.
- **Never hardcode a backend URL.** Use `getUrl()` from `environment.js`. A test fails if a hardcoded backend URL appears anywhere else.
- **Adding a page** means a `lazy()` route in `App.jsx` plus one entry at the **same index** in each of the four menu arrays in `Header.jsx`.
- **Environment check:** on load the browser console prints `[Environment] OK frontend=X backend=Y`. A `MISMATCH` error means the page host and the backend's `DEPLOYMENT_ENV` disagree.

### Frontend commands

```powershell
cd frontend
npm install       # install dependencies
npm start         # dev server on http://localhost:3000 (expects the backend on 127.0.0.1:5000)
npm run build     # production build -> dist/
npm run preview   # serve the built dist/ locally
```

---

## Tests

Tests live outside both apps in `tests/`; see [tests/README.md](../tests/README.md).

```powershell
python -m pytest -c tests/pytest.ini                     # backend + frontend (offline)
node --test "tests/frontend/*.test.mjs"                  # frontend unit tests only
```
