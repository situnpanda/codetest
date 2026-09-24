import pandas as pd
import numpy
import pyodbc
from datetime import datetime
import sys
from pathlib import Path

# Add the parent directory to sys.path for module imports
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(root))

from shared.dataBase import queryDw, connectToDw_AADpwd, connectToDw_AADpwd_Write, queryAeroSnowflake


def fetch_apm_numbers():
    apm_query = """
        SELECT [APM Number]
        FROM [Application List]
        WHERE [Last Updated] = (SELECT MAX([Last Updated]) FROM [Application List])
          AND [APM Number] IS NOT NULL
    """

    connectionString = connectToDw_AADpwd(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org",
    )

    rows = queryDw(connectionString, apm_query)
    apm_list = ", ".join(f"'{r[0]}'" for r in rows if r[0])
    print(f"[DEBUG] fetch_apm_numbers: {len(rows)} APM numbers resolved")
    return apm_list


def patchComplianceData(apmNumber):
    compliance_query = f"""
        SELECT a.ServerName, a.IsServerCompliant, a.ServerComplianceUpdatedDate,
            a.collectionName, a.Status, a.State, b.Attribute11
        FROM ESI_AERO_PROD_DB.reporting.vw_MEMCM_host_servers_compliance_details a
        JOIN ESI_AERO_PROD_DB.reporting.vw_MEMCM_host_servers_agent_health b ON a.ServerName = b.ServerName
        WHERE a.Status NOT LIKE '%Not Applicable%' AND b.APMNumber IN ({apmNumber})
        GROUP BY a.ServerName, a.IsServerCompliant, a.ServerComplianceUpdatedDate,
            a.collectionName, a.Status, a.State, b.Attribute11, b.collectionNames;
    """

    patch_list = queryAeroSnowflake(compliance_query)

    if not patch_list:
        return pd.DataFrame()

    columns = ["ServerName", "IsServerCompliant", "ServerComplianceUpdatedDate",
               "collectionName", "Status", "State", "Attribute11"]
    patch_data_df = pd.DataFrame(numpy.array(patch_list), columns=columns)
    patch_data_df.rename(columns={"Attribute11": "PatchWindow"}, inplace=True)

    # Existing schema stores the compliance date as bigint epoch-ms.
    patch_data_df["ServerComplianceUpdatedDate"] = (
        pd.to_datetime(patch_data_df["ServerComplianceUpdatedDate"]).astype("int64") // 10 ** 6
    )

    print(f"[DEBUG] patchComplianceData: {len(patch_data_df)} rows fetched from Snowflake")
    return patch_data_df


def insert_data_patchcompliance(df):
    print(f"[DEBUG] insert_data_patchcompliance: START - {len(df)} rows to insert")
    df = df[[
        "ServerName", "IsServerCompliant", "ServerComplianceUpdatedDate",
        "collectionName", "Status", "State", "PatchWindow", "LastUpdated"
    ]]

    delete_query = "DELETE FROM ServerPatchCompliance"
    insert_query = """
    INSERT INTO ServerPatchCompliance (
        ServerName, IsServerCompliant, ServerComplianceUpdatedDate,
        collectionName, Status, State, PatchWindow, LastUpdated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """

    # Small helpers: NaN/NaT -> None; datetimes must be naive for SQL Server ODBC.
    def _s(v): return None if pd.isna(v) else str(v)
    def _i(v): return None if pd.isna(v) else int(v)
    def _dt(v):
        if pd.isna(v): return None
        dt = v.to_pydatetime() if hasattr(v, "to_pydatetime") else v
        return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt

    params = [
        (_s(r.ServerName), _i(r.IsServerCompliant), _i(r.ServerComplianceUpdatedDate),
         _s(r.collectionName), _s(r.Status), _s(r.State), _s(r.PatchWindow),
         _dt(r.LastUpdated))
        for r in df.itertuples(index=False)
    ]

    conn_string = connectToDw_AADpwd_Write(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org",
    )

    with pyodbc.connect(conn_string) as conn:
        with conn.cursor() as cursor:
            cursor.execute(delete_query)
            print(f"[DEBUG] insert_data_patchcompliance: deleted {cursor.rowcount} existing rows")

            cursor.fast_executemany = True
            # Lock parameter types so fast_executemany doesn't infer NVARCHAR
            # from a row-0 NULL and fail later rows with ODBC 22018.
            cursor.setinputsizes([
                (pyodbc.SQL_WVARCHAR, 255, 0),   # ServerName
                pyodbc.SQL_INTEGER,              # IsServerCompliant
                pyodbc.SQL_BIGINT,               # ServerComplianceUpdatedDate (epoch ms)
                (pyodbc.SQL_WVARCHAR, 255, 0),   # collectionName
                (pyodbc.SQL_WVARCHAR, 255, 0),   # Status
                (pyodbc.SQL_WVARCHAR, 255, 0),   # State
                (pyodbc.SQL_WVARCHAR, 100, 0),   # PatchWindow
                pyodbc.SQL_TYPE_TIMESTAMP,       # LastUpdated
            ])
            cursor.executemany(insert_query, params)
        conn.commit()

    print("[DEBUG] insert_data_patchcompliance: END - commit successful")


apm_numbers = fetch_apm_numbers()
patch_df = patchComplianceData(apm_numbers)

if "ServerName" in patch_df.columns:
    patch_df["ServerName"] = patch_df["ServerName"].str.lower()

# Pass a naive datetime to SQL Server (ODBC datetime2 rejects tz-aware -> 22018).
patch_df["LastUpdated"] = datetime.now().replace(microsecond=0)

patch_df = patch_df.drop_duplicates().reset_index(drop=True)
print(patch_df.columns)
print(patch_df)

try:
    print("Starting SQL insert for ServerPatchCompliance...")
    insert_data_patchcompliance(patch_df)
    print("All data inserted successfully into ServerPatchCompliance.")
except Exception as e:
    print("Failed during final insert:", e)
