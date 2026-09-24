# Batch jobs

The `jobs/` folder sits at the repository root (sibling of `backend/`) and
contains standalone scripts that run out-of-process on a schedule.

```
itelemetry-v3/
├── backend/
├── frontend/
└── jobs/        <- batch/scheduled scripts
```

## How jobs resolve backend modules

Because `jobs/` lives outside `backend/`, each job adds the backend folder to
`sys.path` before importing `domains.*` or `shared.*`:

```python
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from domains.metrics.ServerMetricsPerf import getServerPerf
from shared.dataBase import queryDw
```

`parents[1]` is the `itelemetry-v3` root; appending `"backend"` points imports
at `itelemetry-v3/backend`.

## Categories

- **List_Update** scripts — refresh reference lists (servers, databases,
  file shares, load balancers, applications).
- **Push*_toADX / _toDB / _toLA** scripts — push telemetry to Azure Data
  Explorer, SQL, or Log Analytics.
- **Aggregate/health** scripts — compute application aggregate health.

## Running a job

```powershell
cd jobs
c:/iTelemetry6/venv/Scripts/python.exe <JobName>.py
```

Jobs require `az login` and network access to the Azure data sources.
