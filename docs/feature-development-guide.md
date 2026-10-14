# Feature Development Guide

How to add a new feature or change an existing one: which files to touch, what to write in each,
and how to test it.

> Related: [project-structure.md](project-structure.md) · [branching-strategy.md](branching-strategy.md) ·
> [jobs.md](jobs.md) · [tests/README.md](../tests/README.md)

---

## 1. How a request flows

```
1. Page component   frontend/src/Components/features/<Feature>/<Feature>.jsx
2. API function     frontend/src/Components/shared/APIs/fetchAPIs.jsx   (updateAPIs.jsx for writes)
        │  HTTP /api/...
3. Route            backend/apis/<group>.py
4. Logic + query    backend/domains/<domain>/<area>/<feature>.py
5. Connector        backend/shared/adx.py · dataBase.py · logAnalytics.py · keyVault.py
6. Data             ADX · Azure SQL · Log Analytics   (filled by scripts in jobs/)
```

Each layer only calls the one below it. A new feature is usually **one new function in each of
layers 1–4**.

---

## 2. Where does my code go?

| I need to… | Put it in |
|---|---|
| Add an endpoint | `backend/apis/<group>.py` (pick the group in §3) |
| Write the query / logic | `backend/domains/<domain>/<area>/<feature>.py` |
| Query ADX / SQL / Log Analytics | `readFromADX` (`shared.adx`) / `queryDw` (`shared.dataBase`) / `queryInLogAnalytics` (`shared.logAnalytics`) |
| Read a secret | `connectToKeyVault("name")` (`shared.keyVault`) |
| A value that differs per environment | a dict keyed by `ENVIRONMENT` (`shared.environment`), like `ADX_CLUSTER_BY_ENV` in [shared/adx.py](../backend/shared/adx.py) |
| Code used by 2+ domains | `backend/shared/` |
| Call the backend from the UI | `fetch…` in [fetchAPIs.jsx](../frontend/src/Components/shared/APIs/fetchAPIs.jsx), `update…` in [updateAPIs.jsx](../frontend/src/Components/shared/APIs/updateAPIs.jsx) |
| A new page | `frontend/src/Components/features/<Feature>/` |
| A widget used on several pages | `frontend/src/Components/shared/<Widget>/` |
| Tests | `tests/` (see §6) |

---

## 3. Which folder for which area

| Feature area | Logic | Route |
|---|---|---|
| Alert rules, triggers, maintenance | `domains/alerts/` | `apis/alerts.py` |
| Seasonal / pattern / anomaly analysis | `domains/metrics/analytics/` | `apis/analytics.py` |
| Servers, DB, file storage, Citrix, patch, backup | `domains/metrics/infrastructure/` | `apis/infrastructure.py` |
| Services, URLs, interfaces, incidents, change requests | `domains/metrics/application/` | `apis/application.py` |
| Network, load balancers, Moxa, CrowdStrike | `domains/metrics/network/` | `apis/network.py` |
| Credential inventory | `domains/metrics/security/` | `apis/security.py` |
| Filters, onboarding, app summary, support groups | `domains/metadata/` | `apis/metadata.py` |
| ChatOps / early warnings | `domains/chatops/` | `apis/chatops.py` |
| System ops, user/perf metrics, environment | `domains/metrics/infrastructure/` | `apis/misc.py` |

Don't create a new API file or domain folder unless the team agrees in review.

---

## 4. Add a new feature (step by step)

Example: a made-up **"Server Reboot History"** page. Replace the names with your own.

### Step 1: Branch

```powershell
git checkout main; git pull
git checkout -b feature/server-reboot-history
```

### Step 2: Logic (backend)

New file `backend/domains/metrics/infrastructure/rebootHistory.py`:

```python
import json
import re

from shared.adx import readFromADX
from shared.appinsightsLogger import error_response
from shared.dataBase import exceptioninfo

_SAFE_NAME = re.compile(r"[A-Za-z0-9._ -]{1,100}")   # only safe characters go into the query


def get_reboot_history(app_ci, days=7):
    if not _SAFE_NAME.fullmatch(app_ci or ""):
        return error_response(400, "Invalid appCI")
    days = int(days) if str(days) in ("7", "14", "30") else 7
    try:
        df = readFromADX(f"""<YourAdxTable>
| where TimeGenerated > ago({days}d) and ApplicationCI == '{app_ci}'
| project TimeGenerated, ServerName, Reason""")
        payload = {"reboots": json.loads(df.to_json(orient="records")), "windowDays": days}
        return {"status": 200, "Data": json.dumps(payload), "meta": {}, "error": None}
    except Exception as ex:
        return error_response(500, "Failed to fetch reboot history", detail=exceptioninfo(ex), exc=ex)
```

- **Validate every value** before it goes into a query. For SQL, pass values as `?` parameters to `queryDw`.
- Success returns `{"status", "Data", "meta", "error"}`. Failure returns `error_response(...)`.
- Imports are absolute and match the file name's case exactly (`shared.adx`, not `shared.ADX`). Prod runs on Linux.

### Step 3: Route (backend)

In `backend/apis/infrastructure.py`:

```python
from domains.metrics.infrastructure.rebootHistory import get_reboot_history

@infrastructure_bp.route("/api/infrastructureMetrics/rebootHistory", methods=["GET"])
@log_performance()
def getRebootHistory():
    return get_reboot_history(request.args.get("appCI", ""), request.args.get("days", 7))
```

- The path always starts with `/api/`. Always add `@log_performance()`.
- If the endpoint **changes data**, check the login token: copy `updateAlertRules()` in [apis/alerts.py](../backend/apis/alerts.py).
- `main.py` doesn't change (only a brand-new API file needs registering).

### Step 4: API function (frontend)

In [fetchAPIs.jsx](../frontend/src/Components/shared/APIs/fetchAPIs.jsx):

```javascript
export async function fetchRebootHistory(appCI, days = 7) {
    const url = new URL(baseUrl + 'infrastructureMetrics/rebootHistory');
    url.searchParams.set('appCI', appCI);
    url.searchParams.set('days', days);
    const data = await requestJson(url, { method: 'GET' });
    return JSON.parse(data.Data);
}
```

Never hardcode a backend URL. `baseUrl` already comes from `getUrl()`.

### Step 5: Page (frontend)

New file `frontend/src/Components/features/RebootHistory/RebootHistory.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { Alert, CircularProgress } from '@mui/material';
import { fetchRebootHistory } from '../../shared/APIs/fetchAPIs';

export default function RebootHistory({ appCI }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRebootHistory(appCI).then((d) => setRows(d.reboots)).catch((e) => setError(e.message));
  }, [appCI]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <CircularProgress />;
  return <div>{/* render rows */}</div>;
}
```

If it's a **new page** (not a section inside an existing page):

1. [App.jsx](../frontend/src/App.jsx): add
   `const RebootHistory = lazy(() => import('./Components/features/RebootHistory/RebootHistory'));`
   and `<Route path="/rebootHistory" element={<RebootHistory />} />`.
2. [Header.jsx](../frontend/src/Components/features/Header/Header.jsx): add one entry at the
   **same position** in each of the 4 menu lists: `icons` (an MUI icon), `routes` (`'rebootHistory'`),
   `pageDevStatus` (`''`), `routesLabels` (`'Reboot History'`).

### Step 6: Run it locally

```powershell
az login
# from the repo root
# terminal 1: backend on http://127.0.0.1:5000
cd backend; python main.py
# terminal 2: frontend on http://localhost:3000
npm --prefix frontend run dev
```

The browser console should show `[Environment] OK frontend=development backend=development`.

---

## 5. Change an existing feature

1. **Find the code.** Page URL → `<Route>` in `App.jsx` → component → the `fetch…`/`update…`
   function it calls → its URL string → search the routes:
   ```powershell
   Select-String -Path backend\apis\*.py -Pattern 'infrastructureMetrics/performanceMetrics'
   ```
   The route tells you which domain function to open.
2. **Find who else uses it.** Jobs import backend code too, so search all three folders:
   ```powershell
   Get-ChildItem frontend\src, backend, jobs -Recurse -Include *.py,*.js,*.jsx | Select-String 'get_performance_metrics'
   ```
3. **Don't break callers.**
   - Adding response fields is fine. Renaming or removing one means updating every caller in the same PR.
   - Keep status codes the same.
   - To rename a route, put the old and new `@route(...)` lines on the same function.

---

## 6. Test

From the repo root:

```powershell
python -m pytest -c tests/pytest.ini                                     # offline suite, run before every push
npm --prefix frontend run build                                            # frontend build
# optional, against real Azure (needs az login):
$env:ITELEMETRY_LIVE_TESTS='1'; python -m pytest -c tests/pytest.ini; Remove-Item Env:ITELEMETRY_LIVE_TESTS
```

Add a unit test in `tests/backend/unit/test_<feature>.py`:

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

- Patch the name in the module that **uses** it (`rebootHistory.readFromADX`).
- Test file names must be unique across `tests/`.
- Fake data only. No real patient data, PHI or secrets.

---

## 7. Rules

- No secrets in code. Use Key Vault.
- SQL: `?` parameters. KQL: allow only safe values (regex or fixed list).
- Endpoints that change data must check the login token.
- Return errors with `error_response(...)`, never `str(ex)` or a stack trace.
- Environment comes only from `ENVIRONMENT` (backend) and `getUrl()` (frontend). Never from hostnames.
- No new pip/npm package without approval. Pin exact versions.
- Don't change Helm, pipelines or Azure resources in a feature PR.
- No PHI in code, logs, tests or PR screenshots.

---

## 8. Checklist

**Before opening the PR**

- [ ] Logic in `domains/`, route in `apis/` with `/api/` path and `@log_performance()`
- [ ] Inputs validated; token check if it changes data
- [ ] API function in `shared/APIs/`, page in `features/`; route + 4 menu lists if it's a new page
- [ ] For changes: searched callers in `frontend/`, `backend/` and `jobs/`
- [ ] Tests added; offline suite and frontend build pass
- [ ] Checked in the browser: request returns 200, no console errors

**After merge**

The pipeline deploys dev → staging → prod (staging and prod need approval), then tags the release
`vX.Y.Z`. Put `#minor` or `#major` in the PR title for bigger changes. In each environment:

- [ ] Console shows `[Environment] OK frontend=<env> backend=<env>`
- [ ] The feature works with that environment's data

---

## 9. A real example to copy

The **Audit Report → Performance** tab follows this pattern end to end:

| Layer | File | Function |
|---|---|---|
| Page | [AuditReport.jsx](../frontend/src/Components/features/AuditReport/AuditReport.jsx) | `PerformanceTabContent` |
| API function | [fetchAPIs.jsx](../frontend/src/Components/shared/APIs/fetchAPIs.jsx) | `fetchPerformanceMetrics_fromADX(days)` |
| Route | [apis/misc.py](../backend/apis/misc.py) | `getPerformanceMetrics()` |
| Logic | [userMetrics.py](../backend/domains/metrics/infrastructure/userMetrics.py) | `get_performance_metrics(days)` |
| Connector | [logAnalytics.py](../backend/shared/logAnalytics.py) | `queryInLogAnalytics(...)` |
| Test | [test_user_metrics_env_filter.py](../tests/backend/unit/test_user_metrics_env_filter.py) | |
