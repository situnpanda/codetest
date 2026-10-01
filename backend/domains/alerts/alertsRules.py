# import azure.functions as func
import logging
import json
from datetime import datetime, timedelta
import pytz

from shared.keyVault import connectToKeyVault
from shared.dataBase import connectToDw_AADpwd

# app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

def AlertRuleFilterBasedOnCustomThreshold():
    logging.info('Python HTTP trigger function processed a request.')
    logging.info("hello")
    data = req.get_body().decode('utf-8')
    try:
        data = json.loads(data)
        # logging.info('Data %s',data)
        # logging.info(type(data))
        serverData = data["data"]["alertContext"]["condition"]["allOf"]
        # logging.info('Request Data Length: %s', len(serverData))
        # logging.info(serverData)
        mainArr = []
        for i in range(len(serverData)):
            a={}
            # logging.info('Request Data s: %s', serverData[i]["dimensions"])
            for j in serverData[i]["dimensions"]:
                a[j["name"]] = j["value"]
            mainArr.append(a)
        # logging.info(mainArr)

    except Exception as ex:
        logging.error(ex)
        return func.HttpResponse(f"This HTTP triggered function execution failed.")
    return func.HttpResponse(f"This HTTP triggered function executed successfully.")
    

    # try:
    #     alert_data = req.get_json() 
    #     logging.info('Received JSON body: %s', alert_data)
    #     print(alert_data)
    # except Excetion as ex:
    #     logging.info('Received Error: %s', ex)
    
    # name = req.params.get('name')
    # if not name:
    #     try:
    #         req_body = req.get_json()
    #     except ValueError:
    #         pass
    #     else:
    #         name = req_body.get('name')

    # if name:
    #     return func.HttpResponse(f"Hello, {name}. This HTTP triggered function executed successfully.")
    # else:
    #     return func.HttpResponse(
    #          "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.",
    #          status_code=200
    #     )

@app.route(route="AlertsCustomThresholdValidation", auth_level=func.AuthLevel.FUNCTION)
def AlertsCustomThresholdValidation(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')

    name = req.params.get('name')
    if not name:
        try:
            req_body = req.get_json()
        except ValueError:
            pass
        else:
            name = req_body.get('name')

    if name:
        return func.HttpResponse(f"Hello, {name}. This HTTP triggered function executed successfully.")
    else:
        return func.HttpResponse(
             "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.",
             status_code=200
        )

@app.route(route="AlertsCustomThreshold", auth_level=func.AuthLevel.FUNCTION)
def AlertsCustomThreshold(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')

    name = req.params.get('name')
    if not name:
        try:
            req_body = req.get_json()
        except ValueError:
            pass
        else:
            name = req_body.get('name')

    if name:
        return func.HttpResponse(f"Hello, {name}. This HTTP triggered function executed successfully.")
    else:
        return func.HttpResponse(
             "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.",
             status_code=200
        )