// Single source of truth for environment + backend URL resolution.
//
// The SPA and the API are served from the SAME host via the AKS ingress
// (`/` -> frontend, `/api` -> backend), so in every hosted environment we
// call the backend same-origin and derive the environment from the hostname.
//
// Hosts:
//   https://itelemetry.wu2.cloud.providence.org      -> production
//   https://itelemetry.testwu2.cloud.providence.org  -> staging (test)
//   https://itelemetry.devwu2.cloud.providence.org   -> development (dev)
//   localhost / 127.0.0.1                             -> development (local)

const ENV_BY_HOST = {
    "itelemetry.wu2.cloud.providence.org": "production",
    "itelemetry.testwu2.cloud.providence.org": "staging",
    "itelemetry.devwu2.cloud.providence.org": "development",
};

const host = (typeof window !== "undefined" && window.location?.hostname) || "";
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

export const getEnvironment = () => ENV_BY_HOST[host] || "development";

export const getUrl = () =>
    // Local dev talks to the local backend; hosted is same-origin (ingress routes `/api`).
    isLocal ? "http://127.0.0.1:5000/api/" : `${window.location.origin}/api/`;

// Prints the backend's resolved environment (GET /api/environment) in the browser
// console, in the same format as the backend startup logs, and confirms it
// matches the environment derived from this page's hostname.
export const logBackendEnvironment = async () => {
    const frontendEnv = getEnvironment();
    try {
        const res = await fetch(`${getUrl()}environment`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const info = JSON.parse((await res.json()).Data);

        if (!info.deploymentEnvSet) {
            console.warn(`[Environment] DEPLOYMENT_ENV not set -> defaulting to '${info.environment}'`);
        }
        console.info(info.appInsightsEnabled
            ? `[Logger] Azure Monitor initialized (${info.environment})`
            : "[Logger] No connection string — console logging only");
        console.info(`[ADX] environment=${info.environment} cluster=${info.adxCluster} database=${info.adxDatabase}`);

        if (info.environment === frontendEnv) {
            console.info(`[Environment] OK frontend=${frontendEnv} backend=${info.environment}`);
        } else {
            console.error(`[Environment] MISMATCH frontend=${frontendEnv} (host ${host || "none"}) backend=${info.environment}`);
        }
    } catch (err) {
        console.error(`[Environment] Could not read backend environment from ${getUrl()}environment: ${err.message}`);
    }
};
