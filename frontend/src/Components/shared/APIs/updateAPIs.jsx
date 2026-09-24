import {getUrl} from "../../../environment"
import { requestJson } from "./fetchAPIs"

var baseUrl = getUrl()

export async function updateEarlyWarningStatus(backendSessionToken, params){
    var url = new URL(baseUrl + 'chatInitiator/acknowledgeResolveEarlyWarning');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backendSessionToken}`
        },
        body: JSON.stringify(params)
    });
    return data["Data"]
}

export async function updateWarningEventsStatus(backendSessionToken, params){
    var url = new URL(baseUrl + 'chatInitiator/updateWarningEventsData');

    const data = await requestJson(url, {
        method:'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backendSessionToken}`
        },
        body: JSON.stringify(params)
    });
    return data["Data"]
}