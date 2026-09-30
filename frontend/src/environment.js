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
