# Local development

## Prerequisites

- Python virtual environment at `c:/iTelemetry6/venv`
- Node.js (for the frontend)
- `az login` completed, with network access to the Azure data sources
  (KeyVault, ADX/Kusto, SQL Server, Log Analytics)

## Backend

```powershell
cd backend
c:/iTelemetry6/venv/Scripts/python.exe -m flask --app main run --port 5000
```

The API is served under `http://127.0.0.1:5000/api/`.

## Frontend

```powershell
cd frontend
npm install
npm start          # dev server on port 3000
```

The frontend reads its API base URL from `src/environment.js`.

## Jobs

```powershell
cd jobs
c:/iTelemetry6/venv/Scripts/python.exe <JobName>.py
```

See [jobs.md](jobs.md) for how jobs resolve backend modules.
