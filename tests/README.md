# Tests

Automated tests for iTelemetry.

```
tests/
├── conftest.py                        → puts backend/ on sys.path, `app`/`client` fixtures,
│                                        `reload_with_env`, skips live tests, disables App Insights export
├── pytest.ini                         → pytest configuration and markers
├── backend/
│   ├── test_backend_imports.py        → static audit: local imports resolve (exact case, as on Linux/AKS),
│   │                                    imported names exist, 3rd-party pkgs installed + pinned
│   ├── test_smoke.py                  → app boots, all blueprints + frontend-facing routes registered
│   ├── unit/                          → fast, isolated (no Azure calls)
│   │   ├── test_environment.py        → exact DEPLOYMENT_ENV names/defaults (shared/environment.py)
│   │   ├── test_adx_routing.py        → ADX cluster per environment
│   │   ├── test_appinsights_environment.py → log records tagged with DEPLOYMENT_ENV
│   │   └── test_user_metrics_env_filter.py → perf metrics filtered to current env + endpoint
│   └── integration/
│       └── test_live_e2e.py           → real Key Vault, 3 ADX clusters, Log Analytics (opt-in)
└── frontend/
    ├── test_frontend_imports.py       → static audit: relative imports resolve (exact case), named/default
    │                                    exports exist, bare imports declared, no hardcoded backend URLs
    ├── environment.test.mjs           → node:test for src/environment.js (host -> env / API URL)
    └── test_frontend_environment.py   → runs environment.test.mjs under pytest (skipped if no node)
```

## Running

```powershell
# from the repo root  — offline: unit + import audits (live tests skipped)
python -m pytest -c tests/pytest.ini

# live end-to-end (requires `az login` + network; read-only queries)
$env:ITELEMETRY_LIVE_TESTS = '1'
python -m pytest -c tests/pytest.ini
Remove-Item Env:ITELEMETRY_LIVE_TESTS

# frontend environment tests only (Node 20+, no npm packages needed)
node --test "tests/frontend/*.test.mjs"
```

Requires `pytest` in the environment. Offline runs stub Key Vault while `main` is imported
(`domains/metadata/getComponentList.py` reads a secret at import time). No test sends
telemetry to Application Insights.

## Conventions

- Name Python files `test_*.py` with **unique basenames** (no `__init__.py`, so pytest imports test modules by basename).
- Mark tests with `pytestmark = pytest.mark.unit` or `pytest.mark.integration`.
- Use the `client` fixture for HTTP-level tests; patch `shared/` connectors in unit tests.
- Use `reload_with_env("staging", "shared.adx")` to test env-dependent module constants.
- Never put real patient data, PHI or secrets in tests.
