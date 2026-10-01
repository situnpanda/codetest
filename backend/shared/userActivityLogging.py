from flask import Blueprint, jsonify, request
from datetime import datetime
import pytz
from shared.dataBase import connectToDw_AADpwd_Write, insertDw, exceptioninfo,insert_data
from shared.appinsightsLogger import error_response

activity_logging_bp = Blueprint("activityLogging", __name__, url_prefix="/api/logging")

connectionString_write = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")


@activity_logging_bp.route("/LogUserActivity", methods=["POST"])
def log_user_activity(data={}):
    try:
        if(len(data)==0):
            data = request.get_json()
        
        pst = pytz.timezone('UTC')
        timeGenerated = datetime.now(pst)
        # print("User Activity Logged:", data)
        
        sqlQuery = f"""
            INSERT INTO [User Activity Logs] ([Time Generated], [Email ID], [Feature Name], [Data], [Exception])
            VALUES (?, ?, ?, ?, ?)
        """
        
        row = (timeGenerated, data.get("emailID"), data.get("featureName"), data.get("data"), data.get("exception") )
        res = insertDw(connectionString_write, sqlQuery,[row])
        print(res)
        return {"status": 200, "Data": "User activity logged successfully.", "meta": {}, "error": None}
    except Exception as ex:
        print("Exception in logging user activity:")
        print(ex)
        info = exceptioninfo(ex)
        insert_data(info)
        return error_response(501, "Failed to log user activity", detail=info, exc=ex)