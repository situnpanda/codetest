import sys
from pathlib import Path

# Add the parent of the current folder to sys.path so sibling modules resolve
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from flask import Blueprint, request, jsonify
from datetime import datetime
import pandas as pd

from shared.ADX import readFromADX
from shared.dataBase import exceptioninfo

from shared.appinsights_logger import log_performance, error_response

citrixPerf = Blueprint(
    "infrastructureTelemetry_citrixMetrics",
    __name__,
    url_prefix="/api/infrastructureMetrics",
)


@citrixPerf.route("/citrixPerfMetrics", methods=["POST"])
@log_performance()
def getCitrixPerf(data={}):
    """
    Fetch all rows currently present in the Citrix_Metrics_Perf ADX table.
    No time / app filters are applied for now - returns everything.
    """
    try:
        # Accept a JSON body (even though it isn't used right now) so the
        # contract stays consistent with the other infrastructureMetrics APIs.
        if len(data.keys()) == 0:
            try:
                _ = request.get_json(silent=True) or {}
            except Exception:
                _ = {}

        st = datetime.now()

        adxQuery = """
            Citrix_Metrics_Perf
            | order by TimeGenerated asc
        """

        df_res = readFromADX(adxQuery)
        if isinstance(df_res, pd.DataFrame) and len(df_res):
            if "TimeGenerated" in df_res.columns:
                df_res["TimeGenerated"] = df_res["TimeGenerated"].astype(str)
        else:
            df_res = pd.DataFrame()

        timeTakenByKqlQuery = (datetime.now() - st).total_seconds()

        return {
            "Data": df_res.to_json(orient="records"),
            "status": 200,
            "Time Taken by Kql ADX": timeTakenByKqlQuery,
            "Record Count": len(df_res),
        }

    except Exception as ex:
        try:
            info = exceptioninfo(ex)
        except Exception:
            info = {"error": str(ex)}
        return error_response(500, "Failed to fetch citrix metrics", detail=info, exc=ex)