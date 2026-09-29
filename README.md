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

## Install

The registry password is not stored in the chart. Pass it at install time.

```powershell
# Dev
helm upgrade --install itelemetry ./helmcharts/iTelemetry `
  -n itelemetry --create-namespace `
  -f ./helmcharts/iTelemetry/values-dev.yaml `
  --set registry.password=$env:JFROG_PASSWORD `
  --set backend.image.tag=<tag> --set frontend.image.tag=<tag>

# Staging (test)
helm upgrade --install itelemetry ./helmcharts/iTelemetry `
  -n itelemetry -f ./helmcharts/iTelemetry/values-stag.yaml `
  --set registry.password=$env:JFROG_PASSWORD

# Production
helm upgrade --install itelemetry ./helmcharts/iTelemetry `
  -n itelemetry -f ./helmcharts/iTelemetry/values-prod.yaml `
  --set registry.password=$env:JFROG_PASSWORD
```

## Validate

```powershell
helm lint ./helmcharts/iTelemetry -f ./helmcharts/iTelemetry/values-dev.yaml
helm template itelemetry ./helmcharts/iTelemetry -f ./helmcharts/iTelemetry/values-dev.yaml
```

## Notes

- `backend.env.DEPLOYMENT_ENV` tags App Insights/Log Analytics records with the
  deployment environment (must match the env the frontend requests).
- `secretProviderClass.enabled=false` in prod (TLS via cert-manager instead of
  Key Vault CSI). Test/stag mount the TLS secret from Key Vault `akv-monitoring-01`.
- Set `registry.password` via `--set` or a secret manager; never commit it.
