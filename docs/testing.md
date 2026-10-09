# Testing

Automated tests live in `tests/` at the root of `itelemetry-v3/`. They sit outside
`backend/` and `frontend/` so one suite can cover both apps (and `jobs/` later).
For the per-file list see [tests/README.md](../tests/README.md).

## Layout

```
tests/
├── conftest.py            Puts backend/ on sys.path; `app` / `client` / `reload_with_env` fixtures;
│                          skips live tests by default; disables App Insights export
├── pytest.ini             testpaths = backend frontend; markers `unit`, `integration`
├── backend/
│   ├── test_backend_imports.py   Static audit: imports resolve (exact case, as on Linux/AKS),
│   │                             imported names exist, 3rd-party packages installed + pinned
│   ├── test_smoke.py             App boots; all blueprints and frontend-facing routes registered
│   ├── unit/                     Fast, isolated, no Azure calls
│   └── integration/              Real Key Vault, ADX, Log Analytics (opt-in)
└── frontend/
    ├── test_frontend_imports.py      Static audit: relative imports resolve (exact case), exports exist,
    │                                 bare imports declared in package.json, no hardcoded backend URLs
    ├── environment.test.mjs          node:test for src/environment.js (host -> environment / API URL)
    └── test_frontend_environment.py  Runs environment.test.mjs under pytest (skipped if no Node)
```

## Test types

| Type | Where | What it checks | Needs |
|------|-------|----------------|-------|
| Import audits | `backend/test_backend_imports.py`, `frontend/test_frontend_imports.py` | Broken or wrong-case imports, missing exports, unpinned packages, hardcoded URLs | Nothing (static) |
| Smoke | `backend/test_smoke.py` | The Flask app starts and every route the frontend calls exists | Nothing |
| Unit | `backend/unit/` | Single functions, e.g. `DEPLOYMENT_ENV` handling, ADX cluster per environment | Nothing (connectors mocked) |
| Frontend | `frontend/environment.test.mjs` | Environment and API URL resolution in the browser app | Node 20+ |
| Integration | `backend/integration/` | Real Azure data sources, read-only queries | `az login`, network, `ITELEMETRY_LIVE_TESTS=1` |

## Running

```powershell
# from itelemetry-v3/  (offline: import audits, smoke, unit, frontend; live tests skipped)
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini

# unit tests only
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini -m unit

# live end-to-end (requires az login + network)
$env:ITELEMETRY_LIVE_TESTS = '1'
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini
Remove-Item Env:ITELEMETRY_LIVE_TESTS

# frontend tests only (Node 20+, no npm packages needed)
node --test "tests/frontend/*.test.mjs"
```

Offline runs stub Key Vault while `main` is imported (`domains/metadata/getComponentList.py`
reads a secret at import time). No test sends telemetry to Application Insights.

## Adding a test

1. Create `tests/backend/unit/test_<feature>.py` (the name must be unique across `tests/`).
2. Add `pytestmark = pytest.mark.unit` at the top.
3. Patch the `shared/` connector in the module that **uses** it, call the route, assert on the result:

```python
import json

import pandas as pd
import pytest

pytestmark = pytest.mark.unit


def test_reboot_history(client, monkeypatch):
    from domains.metrics.infrastructure import rebootHistory
    monkeypatch.setattr(rebootHistory, "readFromADX", lambda q: pd.DataFrame([{"ServerName": "srv1"}]))

    r = client.get("/api/infrastructureMetrics/rebootHistory?appCI=MyApp&days=14")

    assert r.status_code == 200
    assert json.loads(r.get_json()["Data"])["windowDays"] == 14
```

4. If the frontend calls a new route, add its path to the route list in `test_smoke.py`
   (the `@pytest.mark.parametrize("path", [...])` block).

See [feature-development-guide.md](feature-development-guide.md) for the full feature workflow.

## Conventions

- Files `test_*.py`, functions `test_*`, **unique basenames** (no `__init__.py`, so pytest
  imports test modules by basename).
- Mark tests with `pytestmark = pytest.mark.unit` or `pytest.mark.integration`.
- Use the `client` fixture for HTTP tests; patch `shared/` connectors so unit tests make no Azure calls.
- Use `reload_with_env("staging", "shared.adx")` to test module constants that depend on the environment.
- Integration tests must be read-only.
- Never put real patient data, PHI or secrets in tests.
