export const getUrl = () => {
    const environment = "";  
    if (environment === 'production') {
        return "https://itelemetry.providence.org/api/"
    } else if (environment === 'staging') {
        return "https://itelemetryStag.providence.org/api/"
    } else {
        return "http://127.0.0.1:5000/api/"
    }
}
