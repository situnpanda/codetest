import { Security } from "@mui/icons-material";
import {getUrl} from "../../../environment"

var baseUrl = getUrl()

// Shared helpers for the standard backend error envelope.
//
// Every backend API returns errors in this uniform shape:
//   {
//     "status": <int>,                // semantic/HTTP status code
//     "error": {
//       "type":      <string>,        // exception/error type
//       "message":   <string>,        // short human-readable summary
//       "detail":    <string|null>,   // optional extra context
//       "trace_id":  <string>,        // correlation id for App Insights
//       "timestamp": <string>         // UTC ISO-8601
//     },
//     "Data": <payload|null>          // null on error, payload on success
//   }
// Successful responses keep "status": 200 with the payload in "Data".

// Extract a human-readable error message from a parsed response body.
export function getApiErrorMessage(data, response) {
    if (data && data.error && data.error.message) return data.error.message;
    if (data && data.Data != null) return String(data.Data);
    if (response) return `HTTP ${response.status}`;
    return "Unknown error";
}

// Perform a fetch and return the parsed JSON body on success
// (HTTP ok AND body status === 200). On any failure it throws an Error
// whose message is derived from the standard error envelope.
export async function requestJson(url, options) {
    const response = await fetch(url, options);
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        data = null;
    }
    if (response.ok && data && data.status === 200) {
        return data;
    }
    throw new Error("API Failed : " + getApiErrorMessage(data, response));
}

export async function fetchAnalytics_fromADX(params){

    var url = new URL(baseUrl + 'infrastructureMetrics/Analytics');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchPatternAnalysis_fromADX(params){

    var url = new URL(baseUrl + 'infrastructureMetrics/PatternAnalysis');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchServicesData_fromADX(params){

    var url = new URL(baseUrl + 'applicationMetrics/serviceUrlMetrics');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchServerPerformance_fromADX(params){

    var url = new URL(baseUrl + 'infrastructureMetrics/serverPerfMetrics');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchCrowdstrikeConnectionData(params){

    var url = new URL(baseUrl + 'crowdstrikeMetrics/getConnectionData');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    // Backend returns Data as an object (not a JSON string).
    return data["Data"]
}

export async function fetchFileStorageMetrics_fromADX(params){

    var url = new URL(baseUrl + 'infrastructureMetrics/fileStoragePerfMetrics');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchLoadBalancerMetrics_fromADX(params) {

    const url = new URL(baseUrl + 'infrastructureMetrics/loadBalancerPerfMetrics');

    const data = await requestJson(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
    return JSON.parse(data["Data"]);
}

export async function fetchNetworkMetrics_fromADX(params){

    var url = new URL(baseUrl + 'infrastructureMetrics/networkPerfMetrics');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchMoxaMetricsWithLatest(params){
    var url = new URL(baseUrl + 'infrastructureMetrics/moxaPerfMetrics');
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...params, "Include Latest": true })
    });
    return {
        data: JSON.parse(data["Data"]),
        latest: (data["meta"] && data["meta"]["Latest"]) ? JSON.parse(data["meta"]["Latest"]) : {}
    }
}

export async function fetchSecurityMetrics_fromADX(params) {
    var url = new URL(baseUrl + 'credentialInventory')
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchDatabaseMetrics_fromADX(params){
    var url = new URL(baseUrl + 'infrastructureMetrics/databasePerfMetrics');
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchEarlyWarnings(backendSessionToken, params){
    var url = new URL(baseUrl + 'chatInitiator/getEarlyWarningsData');
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}

export async function fetchWarningEvents(backendSessionToken, params){
    var url = new URL(baseUrl + 'chatInitiator/getWarningEventsData');
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
    });
    return JSON.parse(data["Data"])
}


export async function fetchCitrixMetrics_fromADX(params){
    var url = new URL(baseUrl + 'infrastructureMetrics/citrixPerfMetrics');
    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params || {})
    });
    return JSON.parse(data["Data"])
}

export async function fetchUserMetrics_fromADX(){
    var url = new URL(baseUrl + 'infrastructureMetrics/userMetrics');

    const data = await requestJson(url, {
        method: 'GET'
    });
    return JSON.parse(data["Data"])
}

export async function fetchPerformanceMetrics_fromADX(days = 7){
    var url = new URL(baseUrl + 'infrastructureMetrics/performanceMetrics');
    url.searchParams.set('days', days);

    const data = await requestJson(url, {
        method: 'GET'
    });
    return JSON.parse(data["Data"])
}