# Frontend tests

The frontend has no JS test framework (no new dependencies added). Tests here use
Python (static import audit) and Node's built-in `node:test` runner.

```powershell
# from itelemetry-v3/
c:/iTelemetry6/venv/Scripts/python.exe -m pytest -c tests/pytest.ini tests/frontend   # both
node --test "tests/frontend/*.test.mjs"                                          # node only
```

- `test_frontend_imports.py` — every relative import resolves with exact case (Linux build),
  named/default imports are exported, bare imports are in `package.json` or a Vite alias,
  and no backend URL is hardcoded outside `src/environment.js`.
- `environment.test.mjs` — `getEnvironment()` / `getUrl()` per host.
