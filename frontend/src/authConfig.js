import { LogLevel } from '@azure/msal-browser';
import {InteractionRequiredAuthError} from '@azure/msal-browser'

export const ssoConfig = {
    auth: {
        clientId: "b5da77da-5b7a-492e-a87f-9d19a636ced0",//"8cc30f46-11e8-44ce-9b4c-a390e819d3da",  // Replace with your Application (Client) ID
        authority: "https://login.microsoftonline.com/2e319086-9a26-46a3-865f-615bed576786", // Replace with your Directory (Tenant) ID and policy
        redirectUri: "/applicationHealth?Name=All&Type=All", //"/applicationHealth?application='All'", // Replace with your redirect URI
    },
    cache: {
        cacheLocation: "localStorage", // This configures where your cache will be stored
        storeAuthStateInCookie: false, // Set this to true if you are having issues on IE11 or Edge
    },
};

export const loginRequest = {
    scopes: ["user.read.all"] 
    // "openid", "profile", "offline_access"
};

export var getToken = async(instance, accounts) =>{
    //var accessToken = ""
    console.log(accounts)
    try{
        var tokenPromise = await instance.acquireTokenSilent({
            account: accounts[0],
            scopes: ["User.Read.All"] // example scope
        })
        var accessToken = await tokenPromise.accessToken
        // console.log(accessToken)
        return accessToken
    }
    catch(error){
        // console.log(error)
        // if(error instanceof InteractionRequiredAuthError){
        // var tokenPromise = 
            await instance.acquireTokenRedirect({
                account: accounts[0],
                scopes: ["User.Read.All"] // example scope
            })
            // var accessToken = await tokenPromise.accessToken
            // //console.log(accessToken)
            // return accessToken
            return ""
        // }
        // else{
        //     console.error("Non-Interactive error")       
        //     return ""
        // }
    }
}

export var getTokenBackend = async(instance, accounts) =>{
    //var accessToken = ""
    console.log(accounts)
    try{
        var tokenPromise = await instance.acquireTokenSilent({
            account: accounts[0],
            scopes: ["api://ae71f988-2029-4cfc-ba20-a4f81d4dd452/iTelemetry.ReadWrite"]//["api://f1a12b92-1409-4c98-8e3e-ff39939dfb1e/iTelemetry.ReadWrite"] // example scope
        })
        var accessToken = await tokenPromise.accessToken
        //console.log(accessToken)
        return accessToken
    }
    catch(error){
        console.log(error)
        //return "Failed"
        // if(error instanceof InteractionRequiredAuthError){
        //     var tokenPromise = await instance.acquireTokenRedirect({
        //         account: accounts[0],
        //         scopes: ["iTelemetry.ReadWrite"] // example scope
        //     })
        //     var accessToken = await tokenPromise.accessToken
        //     //console.log(accessToken)
        //     return accessToken
        // }
        // else{
        //     console.error("Non-Interactive error")
        //     return ""
        // }
        await instance.acquireTokenRedirect({
                account: accounts[0],
                scopes: ["User.Read.All"] // example scope
            })
            // var accessToken = await tokenPromise.accessToken
            // //console.log(accessToken)
            // return accessToken
            return ""
    }
}