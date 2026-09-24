# Tests

Automated tests for iTelemetry v3.

```
tests/
├── conftest.py          → shared fixtures; puts backend/ on sys.path, builds Flask test client
├── pytest.ini           → pytest configuration and markers
└── backend/
    ├── test_smoke.py     → composition-root + route registration smoke tests
    ├── unit/             → fast, isolated tests per domain (no external I/O)
    │   ├── alerting/
    │   ├── metrics/
    │   ├── metadata/
    │   └── chatops/
    └── integration/      → tests that hit Azure/data sources (require az login + network)
```

## Layout rationale

- **Mirrors the backend domains** (`alerting`, `metrics`, `metadata`, `chatops`) so a test's
  location maps directly to the code it covers.
- **`unit/` vs `integration/`** — unit tests are fast and isolated (mock `shared/` connectors);
  integration tests exercise real Azure data sources and are opt-in.
- Tests live **outside** `backend/` (at the repo root) so they can also cover `jobs/` and
  future extracted services without moving.

## Running

```powershell
# from itelemetry-v3/
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini

# unit tests only (skip Azure/network)
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini -m "not integration"
```

Requires `pytest` in the environment: `pip install pytest`.

## Conventions

- Name files `test_*.py`, functions `test_*`.
- Mark tests with `@pytest.mark.unit` or `@pytest.mark.integration`.
- Use the `client` fixture (from `conftest.py`) for HTTP-level tests; mock `shared/`
  connectors in unit tests so no live Azure calls are made.
