# iTelemetry — Helm chart

Helm chart to deploy the iTelemetry backend (Flask/gunicorn) and frontend
(Vite SPA served by nginx) to AKS with Azure Workload Identity, Azure Key Vault
CSI-mounted TLS, nginx ingress, and Linkerd `Server` policies.

## Layout

```
helmcharts/iTelemetry/
  Chart.yaml
  values-dev.yaml    # dev  -> itelemetry.devwu2.cloud.providence.org
  values-stag.yaml   # test -> itelemetry.testwu2.cloud.providence.org
  values-prod.yaml   # prod -> itelemetry.wu2.cloud.providence.org
  templates/
    backend-deployment.yaml
    frontend-deployment.yaml
    service.yaml
    ingress.yaml
    serviceaccount.yaml
    secret-provider-class.yaml
    jfrog-secret.yaml
    linked-server.yaml           # Linkerd Server (frontend)
    linked-server-backend.yaml   # Linkerd Server (backend)
```

## Ports

- Backend container: `5000` (gunicorn `main:app`).
- Frontend container: `80` (nginx serving `dist/`).