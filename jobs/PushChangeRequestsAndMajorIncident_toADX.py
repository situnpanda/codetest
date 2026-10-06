import pandas, pyodbc
import numpy
import sys
import os
import json
import requests
from datetime import datetime, timedelta, timezone
from flask import jsonify
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from shared.dataBase import connectToDw_SqlServerPwd, connectToDw_AADpwd,queryDw,insert_data,exceptioninfo
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential
from shared.adx import connectToADX, readFromADX
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder

SERVICE_HEALTH_SUBSCRIPTIONS = [
    "ab16a144-47d7-45c5-bcb7-8affc988f8e0",
    "9592c342-d1fb-477e-8e91-ad39bf00933b",
    "5467bf57-48b4-4930-b3cb-bf039b259d04",
    "343a7ee0-5081-4024-82fc-498ee61867a9",
    "6d590d81-bab9-4b9a-b011-090467b5a9a4",
]


def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]

def kql_escape(value: str) -> str:
    if value is None:
        return ""
    return (
        str(value)
        .replace("\\", "\\\\")   # escape backslash
        .replace('"', '\\"')    # escape double quotes
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
    )


def upsertChangeAndMiInAdx(df_to_update, batch_size=200):

    if df_to_update.empty:
        return
    try:
        client = connectToADX("https://telemetrycrcav2.westus2.kusto.windows.net")
    except Exception as e:
        print(f"Error connecting to ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    def kql_datetime(val):
        """Return a valid KQL datetime literal."""
        if pandas.isna(val):
            return "datetime(null)"
        return f'datetime("{val.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}")'

    for batch_df in chunk_list(df_to_update, batch_size):

        rows = []

        for _, r in batch_df.iterrows():
            opened = kql_datetime(r["OpenedAt"])
            closed = kql_datetime(r["ClosedAt"])
            batch = kql_datetime(r["BatchTime"])
            
            # Convert AdditionalInformation dict to KQL dynamic literal
            additional_info = r.get("AdditionalInformation", {})
            if pandas.isna(additional_info) or additional_info is None:
                additional_info = {}
            additional_info_kql = f"dynamic({json.dumps(additional_info)})"

            rows.append(
                f'"{kql_escape(r.Number)}", '
                f'"{kql_escape(r.ObjectName)}", '
                f'"{kql_escape(r.ApplicationCI)}", '
                f'"{kql_escape(r.ShortDescription)}", '
                f'{opened}, '
                f'{closed}, '
                f'"{kql_escape(r.PriorityLabel)}", '
                f'"{kql_escape(r.Status)}", '
                f'{batch}, '
                f'{additional_info_kql}'
            )

        datatable_rows = ",\n".join(rows)

        kql = f"""
            .set-or-replace Downtime_Details <|
            let Updated =
                datatable(
                    Number:string,
                    ObjectName:string,
                    ApplicationCI:string,
                    ShortDescription:string,
                    OpenedAt:datetime,
                    ClosedAt:datetime,
                    PriorityLabel:string,
                    Status:string,
                    BatchTime:datetime,
                    AdditionalInformation:dynamic
                )
                [
                    {datatable_rows}
                ];
            // Existing rows (to preserve original BatchTime when updating)
            let Existing =
                Downtime_Details
                | project Number, ObjectName, ExistingBatch=BatchTime;
            // Merge: keep original BatchTime for existing rows, set LastUpdated appropriately (datetime)
            let Merged =
                Updated
                | join kind=leftouter Existing on Number, ObjectName
                | extend BatchTime = iff(isnull(ExistingBatch), BatchTime, ExistingBatch)
                | extend LastUpdated = iff(isnull(ExistingBatch), BatchTime, now())
                | project Number, ObjectName, ApplicationCI, ShortDescription, OpenedAt, ClosedAt, PriorityLabel, Status, BatchTime, LastUpdated, AdditionalInformation;
            // Keep untouched rows as-is; synthesize empty LastUpdated string for schema consistency
            let Anti =
                Downtime_Details
                | join kind=leftanti Updated on Number, ObjectName
                | project Number, ObjectName, ApplicationCI, ShortDescription, OpenedAt, ClosedAt, PriorityLabel, Status, BatchTime, LastUpdated, AdditionalInformation;
            Anti
            | union Merged
        """

        if 'datetime("datetime(' in kql:
            raise ValueError("Invalid KQL detected: double-wrapped datetime")

        try:
            print(f"Upserting {len(batch_df)} rows into ADX...")
            client.execute_mgmt("crca_monitoring_telemetry", kql)
        except Exception as e:
            print(f"Error executing ADX upsert: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            continue

    print("ADX upsert completed successfully.")

def getLatestMiClosedAtFromAdx():
    query = """
        Downtime_Details
        | where ObjectName == "Major Incident"
        | summarize maxClosed = max(ClosedAt)
    """
    try:
        df = readFromADX(query)
    except Exception as e:
        print(f"Error reading latest MI ClosedAt from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        df = pandas.DataFrame([[None]], columns=["maxClosed"])  


    if df.empty or pandas.isna(df.iloc[0, 0]):
        fallback = datetime.now(timezone.utc) - timedelta(hours=24)
        return fallback

    watermark = pandas.to_datetime(df.iloc[0, 0], utc=True).to_pydatetime()
    return watermark

def getLatestChangeRequestsOpenedAtFromAdx():
    query = """
       Downtime_Details
    | where ObjectName == "Change Request"
    | summarize maxOpened = max(OpenedAt)
    """
    try:
        df = readFromADX(query)
    except Exception as e:
        print(f"Error reading latest Change OpenedAt from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        df = pandas.DataFrame([[None]], columns=["maxOpened"])  

    if df.empty or pandas.isna(df.iloc[0, 0]):
        fallback = datetime.now(timezone.utc) - timedelta(hours=24)
        return fallback

    watermark = pandas.to_datetime(df.iloc[0, 0], utc=True).to_pydatetime()
    return watermark



def filterAppCI():

    filterData = dict()
    filterData["appCI"] = []

    try:
        connectionString = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
        try:

            query = """select distinct [Application CI] FROM [Application List] WHERE [Last Updated] = ( SELECT MAX([Last Updated]) FROM [Application List]);"""
            rows = queryDw(connectionString, query)
            if(len(rows)>0):
                df = pandas.DataFrame(numpy.array(rows), columns=["AppCI"])
                filterData["appCI"] = df["AppCI"].to_list()
                appCI = ""

                for row in rows:
                    if(row[0]!=None):
                        appCI = appCI +"'" +row[0]+"' ,"

                return appCI[0:len(appCI)-1]

        except Exception as Ex:
            info =exceptioninfo(Ex,query)
            insert_data(info)    
            return jsonify({'error':str(Ex)}),500
    except Exception as Ex:
        info =exceptioninfo(Ex)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500


def getLatestChangeRequests(appCI, from_start_date):

    columns = ["Number","ObjectName","ApplicationCI","ShortDescription","OpenedAt","ClosedAt","PriorityLabel","Status"]
    empty_df = pandas.DataFrame(columns=columns)

    try:
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER","ServicePerf_DW","servCRCAMonitor")
        if isinstance(appCI, str):
            appCI_list = [ci.strip().strip("'") for ci in appCI.split(",") if ci.strip()]
        else:
            appCI_list = list(appCI)
        # Guard against empty IN list to avoid malformed SQL
        if not appCI_list:
            return empty_df
        placeholders = ",".join(["?"] * len(appCI_list))
        conn = pyodbc.connect(connectToServicePerf)
        cursor = conn.cursor()

        # Parameterized query: both the IN list and date filter use bound parameters (no string interpolation of values)
        query = f"""
            SELECT
                number,
                cmdb_ci_value,
                short_description,
                start_date,
                end_date,
                priority_label,
                state_value
            FROM [ServicePerf_DW].[dbo].[vw_SN_change_request]
            WHERE cmdb_ci_value IN ({placeholders}) 
               AND start_date > ? AND start_date <= GETDATE()
              AND close_code_label <> 'Cancelled'
            ORDER BY start_date DESC;
        """
        params = appCI_list + [from_start_date]
        cursor.execute(query, params)

        rows = cursor.fetchall()

        if not rows:
            return empty_df

        rows = [tuple(r) for r in rows]

        df_final = pandas.DataFrame(
            rows,
            columns=[
                "Number",
                "ApplicationCI",
                "ShortDescription",
                "OpenedAt",
                "ClosedAt",
                "PriorityLabel",
                "Status",
            ]
        )

        # Insert ObjectName in the correct position for adx ingestion
        df_final.insert(1, "ObjectName", "Change Request")

        # Add AdditionalInformation column with empty dict for Change Requests
        df_final["AdditionalInformation"] = df_final.apply(lambda x: {}, axis=1)

        return df_final

    except Exception as ex:
        info = exceptioninfo(ex)
        insert_data(info)
        return empty_df





def getOpenMajorIncidentNumbersFromAdx():
    """Fetch MI numbers from ADX that are NOT yet Closed/Resolved — these need re-checking."""
    query = """
        Downtime_Details
        | where ObjectName == "Major Incident"
        | where Status !in ("Closed", "Resolved")
        | summarize by Number
    """
    try:
        df = readFromADX(query)
    except Exception as e:
        print(f"Error reading open MI numbers from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return []

    if df.empty or "Number" not in df.columns:
        return []

    return df["Number"].dropna().astype(str).unique().tolist()


def getLatestMajorIncidents(appCI, latest_closed_at_MI, open_in_adx_numbers=None):
    columns = ["Number", "ObjectName", "ApplicationCI", "ShortDescription","OpenedAt", "ClosedAt", "PriorityLabel", "Status", "AdditionalInformation"]
    empty_df = pandas.DataFrame(columns=columns)

    if open_in_adx_numbers is None:
        open_in_adx_numbers = []

    try:
        connectToServicePerf = connectToDw_SqlServerPwd("spidedbsv6c6b60.wa.providence.org\\SPIDER","ServicePerf_DW","servCRCAMonitor")

        conn = pyodbc.connect(connectToServicePerf)
        cursor = conn.cursor()

        # Build optional third branch: re-fetch MIs that are still open in ADX
        open_in_adx_clause = ""
        open_in_adx_params = []
        if open_in_adx_numbers:
            placeholders = ",".join(["?"] * len(open_in_adx_numbers))
            open_in_adx_clause = f"""
                OR
                (
                    major_incident_state LIKE 'Accepted'
                    AND number IN ({placeholders})
                )
            """
            open_in_adx_params = open_in_adx_numbers

        query = f"""
            SELECT
                number,
                cmdb_ci_label,
                short_description,
                opened_at,
                resolved_at,
                priority_label,
                state_label_1,
                business_impact,
                cause,
                caused_by,
                u_service_outage_time,
                u_service_restoration_time
            FROM [ServicePerf_DW].[dbo].[vw_SN_incident]
            WHERE
            (
                (
                    major_incident_state LIKE 'Accepted'
                    AND [active] like 'true'
                    AND [state_label_1] NOT IN ('Closed', 'Resolved')
                )
                OR
                (
                    major_incident_state LIKE 'Accepted'
                    AND [state_label_1] IN ('Closed', 'Resolved')
                    AND resolved_at >= ?
                )
                {open_in_adx_clause}
            )
        """

        params = [latest_closed_at_MI] + open_in_adx_params
        cursor.execute(query, params)
        rows = cursor.fetchall()
        print(rows)
        if not rows:
            return empty_df

        rows = [tuple(r) for r in rows]

        df_final = pandas.DataFrame(
            rows,
            columns=[
                "Number",
                "ApplicationCI",
                "ShortDescription",
                "OpenedAt",
                "ClosedAt",
                "PriorityLabel",
                "Status",
                "business_impact",
                "cause",
                "caused_by",
                "u_service_outage_time",
                "u_service_restoration_time"
            ]
        )

        # Filter by AppCI
        appci_list = [ci.strip().strip("'") for ci in appCI.split(",")]
        df_final = df_final[df_final["ApplicationCI"].isin(appci_list)]

        if df_final.empty:
            return empty_df

        # Build AdditionalInformation JSON from the new columns
        def build_additional_info(row):
            return {
                "business_impact": str(row["business_impact"]) if pandas.notna(row["business_impact"]) else "",
                "cause": str(row["cause"]) if pandas.notna(row["cause"]) else "",
                "caused_by": str(row["caused_by"]) if pandas.notna(row["caused_by"]) else "",
                "u_service_outage_time": str(row["u_service_outage_time"]) if pandas.notna(row["u_service_outage_time"]) else "",
                "u_service_restoration_time": str(row["u_service_restoration_time"]) if pandas.notna(row["u_service_restoration_time"]) else ""
            }

        df_final["AdditionalInformation"] = df_final.apply(build_additional_info, axis=1)

        # Drop the individual columns as they are now in AdditionalInformation
        df_final = df_final.drop(columns=["business_impact", "cause", "caused_by", "u_service_outage_time", "u_service_restoration_time"])

        # Insert ObjectName column
        df_final.insert(1, "ObjectName", "Major Incident")
        return df_final

    except Exception as ex:
        print("Error transforming MI dataframe:", ex)
        info = exceptioninfo(ex)
        insert_data(info)
        return empty_df


def getRecentMajorIncidentNumbersFromAdx(lookback_hours=168):
    """Fetch recent Major Incident Numbers from Downtime_Details to check for cancellation."""
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    query = f"""
        Downtime_Details
        | where ObjectName == "Major Incident"
        | where OpenedAt >= datetime({since.strftime('%Y-%m-%dT%H:%M:%S.%fZ')})
        | summarize by Number
    """

    try:
        df = readFromADX(query)
    except Exception as e:
        print(f"Error reading recent Major Incident numbers from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return []

    if df.empty or "Number" not in df.columns:
        return []

    return df["Number"].dropna().astype(str).unique().tolist()


def getCancelledMajorIncidentsFromDw(numbers):
    """Given a list of MI numbers, return those that are now 'Canceled' in DW (ServiceNow view)."""
    if not numbers:
        return []

    try:
        connectToServicePerf = connectToDw_SqlServerPwd(
            "spidedbsv6c6b60.wa.providence.org\\SPIDER",
            "ServicePerf_DW",
            "servCRCAMonitor",
        )
        conn = pyodbc.connect(connectToServicePerf)
        cursor = conn.cursor()

        placeholders = ",".join(["?"] * len(numbers))
        query = f"""
            SELECT DISTINCT number
            FROM [ServicePerf_DW].[dbo].[vw_SN_incident]
            WHERE number IN ({placeholders})
              AND major_incident_state = 'Canceled'
        """

        cursor.execute(query, numbers)
        rows = cursor.fetchall()
        if not rows:
            return []

        return [str(r[0]) for r in rows if r[0] is not None]

    except Exception as ex:
        print("Error fetching cancelled MIs from DW:", ex)
        info = exceptioninfo(ex)
        insert_data(info)
        return []


def deleteCancelledMajorIncidentsFromAdx(numbers_to_delete):
    """Delete rows from Downtime_Details for given Major Incident numbers."""
    if not numbers_to_delete:
        return

    try:
        client = connectToADX("https://telemetrycrcav2.westus2.kusto.windows.net")
    except Exception as e:
        print(f"Error connecting to ADX for deletion: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    values = ",\n".join([f'"{kql_escape(num)}"' for num in numbers_to_delete])

    kql = f'''
        .set-or-replace Downtime_Details <|
        let ToDelete =
            datatable(Number:string)[
                {values}
            ];
        Downtime_Details
        | where ObjectName != "Major Incident" or Number !in (ToDelete)
    '''

    try:
        print(f"Deleting {len(numbers_to_delete)} cancelled Major Incidents from ADX...")
        client.execute_mgmt("crca_monitoring_telemetry", kql)
        print("Deletion of cancelled MIs completed.")
    except Exception as e:
        print(f"Error executing ADX deletion for cancelled MIs: {e}")
        info = exceptioninfo(e)
        insert_data(info)


def getLatestServiceHealthIssues(lookback_days=30):

    columns = ["Number", "ObjectName", "ApplicationCI", "ShortDescription",
               "OpenedAt", "ClosedAt", "PriorityLabel", "Status",
               "AdditionalInformation"]
    all_events = {}  # tracking_id -> merged event dict

    credential = ManagedIdentityCredential(
        client_id='015ad614-f9a5-4333-83b4-b71c01c393d8'
    )
    # credential = AzureCliCredential()
    token = credential.get_token("https://management.azure.com/.default").token
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    for sub_id in SERVICE_HEALTH_SUBSCRIPTIONS:
        url = (
            f"https://management.azure.com/subscriptions/{sub_id}"
            f"/providers/Microsoft.ResourceHealth/events"
            f"?api-version=2022-10-01"
            f"&queryStartTime={since}"
        )

        try:
            while url:
                resp = requests.get(url, headers=headers, timeout=60)
                if resp.status_code != 200:
                    print(f"Service Health API returned {resp.status_code} for sub {sub_id}: {resp.text[:500]}")
                    break
                data = resp.json()
                events = data.get("value", [])
                url = data.get("nextLink")  # handle pagination

                print(f"Sub {sub_id}: got {len(events)} events")

                for evt in events:
                    props = evt.get("properties", {})

                    # Tracking ID is in evt["name"] (e.g. "9Z1Q-_10", "_SVS-5_G")
                    tracking_id = evt.get("name", "")
                    if not tracking_id:
                        continue

                    event_type = props.get("eventType", "")
                    level = props.get("level", "")

                    if level not in ("Critical", "Warning"):
                        continue

                    impact_start = props.get("impactStartTime")
                    impact_end = props.get("impactMitigationTime")
                    status_val = props.get("status", "")
                    title = props.get("title", "")
                    header = props.get("header", "")
                    description = props.get("description", "")
                    recommended_actions = props.get("recommendedActions", {}).get("message", "") if isinstance(props.get("recommendedActions"), dict) else ""

                    # Collect impacted services and regions from this event
                    impact_list = props.get("impact", [])
                    impacted_services = []
                    regions = set()
                    for impact in impact_list:
                        svc_name = impact.get("impactedService", "")
                        if svc_name:
                            impacted_services.append(svc_name)
                        for region_item in impact.get("impactedRegions", []):
                            r = region_item.get("impactedRegion", "")
                            if r:
                                regions.add(r)

                    sub_info = {
                        "subscriptionId": sub_id,
                        "impactedServices": impacted_services,
                        "regions": list(regions),
                    }

                    if tracking_id in all_events:
                        existing = all_events[tracking_id]
                        existing["affectedSubscriptions"].append(sub_info)
                        if impact_end and not existing.get("ClosedAt"):
                            existing["ClosedAt"] = impact_end
                        if status_val:
                            existing["Status"] = status_val
                    else:
                        all_events[tracking_id] = {
                            "Number": tracking_id,
                            "ObjectName": "Service Health Issue",
                            "ApplicationCI": "",
                            "PriorityLabel": level,
                            "Status": status_val,
                            "OpenedAt": impact_start,
                            "ClosedAt": impact_end,
                            "title": title,
                            "header": header,
                            "eventType": event_type,
                            "description": description,
                            "recommendedActions": recommended_actions,
                            "affectedSubscriptions": [sub_info],
                        }

        except Exception as e:
            print(f"Error fetching Service Health for sub {sub_id}: {e}")
            continue

    if not all_events:
        return pandas.DataFrame(columns=columns)

    rows = []
    for tid, info in all_events.items():
        short_desc = json.dumps({
            "title": info["title"],
            "header": info["header"],
            "eventType": info["eventType"],
            "description": info["description"],
            "recommendedActions": info["recommendedActions"],
            "affectedSubscriptions": info["affectedSubscriptions"],
        })
        opened = pandas.to_datetime(info["OpenedAt"], utc=True) if info["OpenedAt"] else pandas.NaT
        closed = pandas.to_datetime(info["ClosedAt"], utc=True) if info["ClosedAt"] else pandas.NaT

        rows.append({
            "Number": info["Number"],
            "ObjectName": "Service Health Issue",
            "ApplicationCI": "",
            "ShortDescription": short_desc,
            "OpenedAt": opened,
            "ClosedAt": closed,
            "PriorityLabel": info["PriorityLabel"],
            "Status": info["Status"],
            "AdditionalInformation": {},
        })

    return pandas.DataFrame(rows, columns=columns)


def latestChangeRequestsandMajorIncidents():
    try:
        appCI = filterAppCI()
    except Exception as e:
        print(f"Error filtering AppCI: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    if not appCI:
        return

    try:
        latest_opened_at_CHG = getLatestChangeRequestsOpenedAtFromAdx()
        latest_closed_at_MI = getLatestMiClosedAtFromAdx()
        open_in_adx = getOpenMajorIncidentNumbersFromAdx()
    except Exception as e:
        print(f"Error retrieving watermarks from ADX: {e}")
        info = exceptioninfo(e)
        insert_data(info)

    try:
        df_changeRequests = getLatestChangeRequests(appCI, latest_opened_at_CHG)
        df_majorIncidents = getLatestMajorIncidents(appCI, latest_closed_at_MI, open_in_adx)
    except Exception as e:
        print(f"Error loading latest CR/MI from DB: {e}")
        info = exceptioninfo(e)
        insert_data(info)
        return

    try:
        df_serviceHealth = getLatestServiceHealthIssues()
        print(df_serviceHealth)
        print(f"Fetched {len(df_serviceHealth)} Service Health issues")
    except Exception as e:
        print(f"Error loading Service Health issues: {e}")
        df_serviceHealth = pandas.DataFrame()

    df = pandas.concat([df_changeRequests, df_majorIncidents, df_serviceHealth], ignore_index=True)
    if df.empty:
        return

    # Apply timezone offset only for Change Request and Major Incident rows
    offset = pandas.Timedelta(hours=8)
    mask = df["ObjectName"].isin(["Change Request", "Major Incident"])
    df.loc[mask, "OpenedAt"] = df.loc[mask, "OpenedAt"] + offset
    df.loc[mask, "ClosedAt"] = df.loc[mask, "ClosedAt"] + offset
    # print(df.values.tolist())

    # Only upsert if there is new/updated data
    if not df.empty:
        batch_time = datetime.now(timezone.utc)
        df["BatchTime"] = batch_time

        column_order = ["Number", "ObjectName", "ApplicationCI", "ShortDescription", "OpenedAt", "ClosedAt", "PriorityLabel", "Status", "BatchTime", "AdditionalInformation"]
        df = df[column_order]

        try:
            upsertChangeAndMiInAdx(df)
            print("Completed Latest MI & Change Request pipeline at", datetime.now())
        except Exception as e:
            print(f"Error during ADX upsert pipeline: {e}")
            info = exceptioninfo(e)
            insert_data(info)
            return

    try:
        recent_numbers = getRecentMajorIncidentNumbersFromAdx()
        cancelled_numbers = getCancelledMajorIncidentsFromDw(recent_numbers)
        deleteCancelledMajorIncidentsFromAdx(cancelled_numbers)
    except Exception as e:
        print(f"Error during cancelled MI cleanup: {e}")
        info = exceptioninfo(e)
        insert_data(info)


if __name__ == "__main__":
    try:
        latestChangeRequestsandMajorIncidents()
    except Exception as e:
        print(f"Fatal error running Latest CR & MI pipeline: {e}")
        info = exceptioninfo(e)
        insert_data(info)