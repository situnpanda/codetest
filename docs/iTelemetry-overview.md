# iTelemetry Technology Overview

This is the overview for the platform. The goal is to understand how the application works as an end-to-end system and where each part belongs.

## 1. Understand the business problem

This platform monitors infrastructure and application health across environments. It gathers telemetry from multiple sources, normalizes it, stores it, and exposes it through dashboards and operational views.

The system is designed around one pattern: data is collected from operational sources, processed in the backend, and surfaced in the frontend for decision-making.

## 2. Know the system flow

The core flow is straightforward:

1. Telemetry is collected from infrastructure, services, Azure resources, SQL data, and monitoring systems.
2. Python jobs and backend logic transform and standardize the data.
3. The backend exposes the result through APIs.
4. The frontend pulls that data and renders charts, tables, and operational views.
5. Azure services support security, observability, storage, and analytics.

If the flow is clear, the project is already well understood at a high level.

## 3. Frontend model

The UI is a Vite + React single-page application. Think of the frontend as the presentation layer: it is responsible for displaying operational insight, not for doing the heavy data processing.

A few concepts are worth keeping in mind:

- React is the core UI framework.
- Vite is the local runner and build tool.
- MUI provides the visual design system.
- Recharts and D3 are used for dashboards and data visualization.
- React Router handles page navigation.
- MSAL provides Azure AD integration.
- Application Insights provides frontend monitoring.

The most important idea is that the frontend should be view-focused, fast, and built around data coming from the backend APIs.

## 4. Backend model

The backend is a Python Flask service. This is where the real operational logic lives.

A few concepts are worth keeping in mind:

- Flask handles the REST API layer.
- Route modules organize endpoints by feature area.
- Domain logic contains the business behavior for metrics, alerts, metadata, and related operational features.
- Shared connectors handle integrations to Azure, SQL, Kusto, Log Analytics, and other infrastructure systems.

This is a modular monolith: the app is organized by domain, but it is still a single deployable backend service. The design keeps responsibilities separated so the system can evolve without becoming chaotic.

The practical rule is simple: API code calls domain logic, and domain logic calls shared connectors.

## 5. Data layer

This project depends heavily on Azure-native data services.

The purpose of each major technology is important to know:

- Azure SQL Database stores reference and metadata data.
- Azure Data Explorer (Kusto / ADX) handles large telemetry analytics and time-series-style querying.
- Azure Log Analytics stores operational and platform logs.
- Azure Key Vault protects credentials and configuration values.
- Azure Storage is used for data movement and persistence.
- Application Insights and Azure Monitor support observability and diagnostics.

This is not a generic Python app. It is an Azure-backed operational analytics platform. Understanding the data sources is essential to understanding the product.

## 6. Ingestion pipeline

The jobs folder is just as important as the API layer. These scripts are the ingestion and refresh layer that keeps the platform current.

They are responsible for:

- collecting telemetry from operational systems
- enriching or transforming data
- pushing results into SQL, ADX, or monitoring outputs
- keeping dashboards and summary views refreshed

If the UI is the front door, the jobs are the engine room. Without the job layer, the application would not stay current.

## 7. Deployment model

This platform is designed for Azure deployment and containerized delivery.

The core deployment patterns are worth knowing:

- Docker packages the application services.
- Helm defines deployment configuration for AKS.
- Nginx serves the frontend build.
- Kubernetes handles service exposure and routing.
- Managed identity and Key Vault reduce secret sprawl and improve security.
- Ingress and service policies provide the network layer.
- One GitHub Actions pipeline builds the image once and promotes it dev -> staging -> prod (staging and prod need approval). Argo CD deploys from the `helmcharts` branch, and each prod release gets a `vX.Y.Z` tag. See [branching-strategy.md](branching-strategy.md).
- The environment comes from `DEPLOYMENT_ENV` (backend) and the browser host name (frontend). See [project-structure.md](project-structure.md).

The operational environment is not a simple local app. This project is built to run as a cloud-native service in Azure.

## 8. Secure and operational thinking

This project runs in an enterprise environment. Security and traceability matter.

A few principles are worth keeping in mind:

- Never hardcode secrets or credentials.
- Prefer secure Azure access patterns instead of manual secret handling.
- Validate input and protect API boundaries.
- Keep observability high so failures are diagnosable.
- Keep changes focused and aligned with domain boundaries.

Operational maturity is part of the engineering standard here.

## 9. Focus on the right understanding

The key ideas to absorb are these:

- The frontend is for visualization and interaction.
- The backend is for processing and API orchestration.
- Shared connectors are the integration layer to Azure and data platforms.
- Jobs keep the system populated with current telemetry.
- Azure services provide the infrastructure backbone.
- The architecture is modular and domain-driven, even though it is deployed as one application.

Once these concepts are clear, every feature becomes easier to understand.

## 10. Important points

When reviewing a feature, it helps to trace the full path:

- what data source is involved
- where it is collected or refreshed
- which API exposes it
- how the frontend renders it
- what Azure or backend dependencies it relies on

That end-to-end view is the real skill to build.

The product is not just a dashboard. It is a telemetry and operations platform, and the value comes from how cleanly the data, APIs, and UI work together.

## Tech stack

- Microsoft Entra ID
- App registrations
- Managed identities
- Azure Kubernetes Service
- Azure Key Vault
- Azure SQL Database
- Azure Data Explorer
- Azure Log Analytics
- Azure Monitor
- Application Insights
- Azure Blob Storage
- Azure Resource Graph
- Azure App Service
- Azure Load Balancer
- Azure Virtual Machines
- Azure RBAC
- Git
- Docker
- Helm
- Kubernetes
- Nginx
- React
- Vite
- Python
- Flask
- Pandas
- NumPy
- MSAL
- OpenTelemetry
- Swagger UI
