# Testing

Automated tests live at the repository root in `tests/`, so they can cover the
`backend/`, `jobs/`, and future extracted services without moving.

## Layout

```
tests/
├── conftest.py          Shared fixtures; puts backend/ on sys.path, builds Flask test client
├── pytest.ini           Pytest configuration and markers
└── backend/
    ├── test_smoke.py     Composition-root + route/import smoke tests
    ├── unit/             Fast, isolated tests per domain (no external I/O)
    │   ├── alerting/
    │   ├── metrics/
    │   ├── metadata/
    │   └── chatops/
    └── integration/      Tests that hit Azure/data sources (require az login + network)
```

## Why this layout

- **Mirrors the backend domains** (`alerting`, `metrics`, `metadata`, `chatops`) so a test's
  location maps directly to the code it covers.
- **`unit/` vs `integration/`** — unit tests are fast and isolated (mock `shared/`
  connectors); integration tests exercise real Azure data sources and are opt-in.
- Tests sit **outside** `backend/` so the same suite can also cover `jobs/` and extracted
  microservices.

## Running

```powershell
# from itelemetry/
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini

# unit only (skip Azure/network)
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini -m "not integration"
```

Requires `pytest`: `pip install pytest`.

## Conventions

- Files `test_*.py`, functions `test_*`.
- Mark tests `@pytest.mark.unit` or `@pytest.mark.integration`.
- Use the `client` fixture (from `conftest.py`) for HTTP-level tests; mock `shared/`
  connectors in unit tests so no live Azure calls are made.
