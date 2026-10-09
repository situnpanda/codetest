// Unit tests for frontend/src/environment.js (run with: node --test tests/frontend)
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENV_JS = pathToFileURL(path.resolve(here, "../../frontend/src/environment.js")).href;

let instance = 0;

// environment.js reads window.location at import time and in getUrl(), so each
// test installs a fake window for its host and loads a fresh module copy.
async function load(hostname) {
    if (hostname !== undefined) {
        globalThis.window = { location: { hostname, origin: `https://${hostname}` } };
    }
    return import(`${ENV_JS}?case=${instance++}`);
}

afterEach(() => {
    delete globalThis.window;
});

const HOSTED = [
    ["itelemetry.wu2.cloud.providence.org", "production"],
    ["itelemetry.testwu2.cloud.providence.org", "staging"],
    ["itelemetry.devwu2.cloud.providence.org", "development"],
];

for (const [host, env] of HOSTED) {
    test(`${host} -> ${env}, same-origin /api/`, async () => {
        const mod = await load(host);
        assert.equal(mod.getEnvironment(), env);
        assert.equal(mod.getUrl(), `https://${host}/api/`);
    });
}

for (const host of ["localhost", "127.0.0.1"]) {
    test(`${host} -> development, local backend`, async () => {
        const mod = await load(host);
        assert.equal(mod.getEnvironment(), "development");
        assert.equal(mod.getUrl(), "http://127.0.0.1:5000/api/");
    });
}

test("no window (SSR/tests) -> development, local backend", async () => {
    const mod = await load(undefined);
    assert.equal(mod.getEnvironment(), "development");
    assert.equal(mod.getUrl(), "http://127.0.0.1:5000/api/");
});

test("unknown hosted domain -> development, same-origin /api/", async () => {
    const mod = await load("example.internal");
    assert.equal(mod.getEnvironment(), "development");
    assert.equal(mod.getUrl(), "https://example.internal/api/");
});

// logBackendEnvironment(): fetches /api/environment and prints/compares it.
async function runLogBackend(hostname, backendInfo) {
    const mod = await load(hostname);
    const lines = { info: [], warn: [], error: [] };
    const saved = { fetch: globalThis.fetch, info: console.info, warn: console.warn, error: console.error };
    let calledUrl;
    globalThis.fetch = async (url) => {
        calledUrl = url;
        return { ok: true, json: async () => ({ status: 200, Data: JSON.stringify(backendInfo) }) };
    };
    console.info = (m) => lines.info.push(m);
    console.warn = (m) => lines.warn.push(m);
    console.error = (m) => lines.error.push(m);
    try {
        await mod.logBackendEnvironment();
    } finally {
        Object.assign(console, { info: saved.info, warn: saved.warn, error: saved.error });
        globalThis.fetch = saved.fetch;
    }
    return { lines, calledUrl };
}

const STAG_INFO = {
    environment: "staging", deploymentEnvSet: true, appInsightsEnabled: true,
    adxCluster: "https://telemetrycrcav2stag.westus2.kusto.windows.net", adxDatabase: "crca_monitoring_telemetry",
};

test("logBackendEnvironment prints backend env and confirms match", async () => {
    const { lines, calledUrl } = await runLogBackend("itelemetry.testwu2.cloud.providence.org", STAG_INFO);
    assert.equal(calledUrl, "https://itelemetry.testwu2.cloud.providence.org/api/environment");
    assert.deepEqual(lines.info, [
        "[Logger] Azure Monitor initialized (staging)",
        "[ADX] environment=staging cluster=https://telemetrycrcav2stag.westus2.kusto.windows.net database=crca_monitoring_telemetry",
        "[Environment] OK frontend=staging backend=staging",
    ]);
    assert.deepEqual(lines.warn, []);
    assert.deepEqual(lines.error, []);
});

test("logBackendEnvironment flags a mismatch and missing DEPLOYMENT_ENV", async () => {
    const info = { ...STAG_INFO, environment: "development", deploymentEnvSet: false, appInsightsEnabled: false };
    const { lines } = await runLogBackend("itelemetry.wu2.cloud.providence.org", info);
    assert.deepEqual(lines.warn, ["[Environment] DEPLOYMENT_ENV not set -> defaulting to 'development'"]);
    assert.ok(lines.info.includes("[Logger] No connection string — console logging only"));
    assert.equal(lines.error.length, 1);
    assert.match(lines.error[0], /MISMATCH frontend=production .* backend=development/);
});
