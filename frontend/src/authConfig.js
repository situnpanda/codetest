// Entra (Azure AD) SSO configuration.

const clientId = "b5da77da-5b7a-492e-a87f-9d19a636ced0";
const tenantId = "2e319086-9a26-46a3-865f-615bed576786";
const backendScope = "api://ae71f988-2029-4cfc-ba20-a4f81d4dd452/iTelemetry.ReadWrite";

const graphScopes = ["User.Read.All"];
const backendScopes = [backendScope];

export const ssoConfig = {
    auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: "/",
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
};

export const loginRequest = {
    scopes: graphScopes,
};

// Acquires a Microsoft Graph token silently; falls back to an interactive
// redirect (which navigates away) when silent acquisition is not possible.
export const getToken = async (instance, accounts) => {
    try {
        const result = await instance.acquireTokenSilent({
            account: accounts[0],
            scopes: graphScopes,
        });
        return result.accessToken;
    } catch (error) {
        await instance.acquireTokenRedirect({
            account: accounts[0],
            scopes: graphScopes,
        });
        return "";
    }
};

// Acquires a backend API token silently; falls back to an interactive redirect
// requesting the SAME backend scope so the user consents to the correct API.
export const getTokenBackend = async (instance, accounts) => {
    try {
        const result = await instance.acquireTokenSilent({
            account: accounts[0],
            scopes: backendScopes,
        });
        return result.accessToken;
    } catch (error) {
        await instance.acquireTokenRedirect({
            account: accounts[0],
            scopes: backendScopes,
        });
        return "";
    }
};