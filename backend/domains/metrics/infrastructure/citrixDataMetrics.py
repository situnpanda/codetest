import sys
from pathlib import Path

# Add the parent of the current folder to sys.path so sibling modules resolve
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from datetime import datetime
import pandas as pd

from shared.adx import readFromADX
from shared.dataBase import exceptioninfo

from shared.appinsightsLogger import error_response


def get_citrix_perf(data={}):
    """
    Fetch all rows currently present in the Citrix_Metrics_Perf ADX table.
    No time / app filters are applied for now - returns everything.
    """
    try:
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
            "status": 200,
            "Data": df_res.to_json(orient="records"),
            "meta": {"Time Taken by Kql ADX": timeTakenByKqlQuery, "Record Count": len(df_res)},
            "error": None,
        }

    except Exception as ex:
        try:
            info = exceptioninfo(ex)
        except Exception:
            info = {"error": str(ex)}
        return error_response(500, "Failed to fetch citrix metrics", detail=info, exc=ex)