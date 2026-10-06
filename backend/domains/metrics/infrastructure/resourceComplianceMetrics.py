import pandas
import sys, os
from shared.adx import readFromADX
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo

from shared.appinsightsLogger import error_response
 
def get_infra_events(dataPost={}):
    try:

        dataPost = dataPost or {}
        hours = int(dataPost.get('hours', 24))
        eventType = dataPost.get('eventType')

        # Support explicit UTC start/end time range; fall back to hours-based lookback
        startTimeParam = dataPost.get('startTime')  # Expected UTC ISO string
        endTimeParam = dataPost.get('endTime')      # Expected UTC ISO string
        use_explicit_range = bool(startTimeParam and endTimeParam)

        if use_explicit_range:
            print("came inside")
            time_filter_backup = f"datetime('{startTimeParam}')"
            time_filter_backup_end = f"datetime('{endTimeParam}')"
        else:
            time_filter_backup = f"ago({hours}h)"
            time_filter_backup_end = "now()"
 
        if eventType == "Backup":
            query = f"""
            let windowStart = {time_filter_backup};
            let windowEnd = {time_filter_backup_end};
            // Latest StartTime per Resource
            let StartRows =
                Resource_Compliance
                | where ObjectName == "Backup" and CounterName == "StartTime"
                | extend StartTime = todatetime(Value)
                | where isnotnull(StartTime)
                | summarize arg_max(LastUpdated, StartTime) by ResourceName
                | project ResourceName, StartTime, StartLU = LastUpdated;
            // Latest EndTime per Resource
            let EndRows =
                Resource_Compliance
                | where ObjectName == "Backup" and CounterName == "EndTime"
                | extend EndTime = todatetime(Value)
                | where isnotnull(EndTime)
                | summarize arg_max(LastUpdated, EndTime) by ResourceName
                | project ResourceName, EndTime, EndLU = LastUpdated;
            // Latest Status per Resource
            let StatusRows =
                Resource_Compliance
                | where ObjectName == "Backup" and CounterName == "Status"
                | summarize arg_max(LastUpdated, Status = Value) by ResourceName
                | project ResourceName, Status, StatusLU = LastUpdated;
            StartRows
            | join kind=leftouter EndRows on ResourceName
            | join kind=leftouter StatusRows on ResourceName
            | extend
                BackupStartTime = StartTime,
                BackupEndTime   = iff(isnull(EndLU) or EndLU < StartLU, datetime(null), EndTime),
                BackupStatus    = iff(isnull(StatusLU) or StatusLU < StartLU, '', Status)
            | where BackupStartTime >= windowStart and BackupStartTime <= windowEnd
            | project ResourceName, BackupStartTime, BackupEndTime, BackupStatus
            | order by BackupStartTime desc
            """
            print("The qeury for backup is ", query)
        elif eventType == "Patch":
            if use_explicit_range:
                patch_date_filter = f"PatchUpdatedDate >= datetime('{startTimeParam}') and PatchUpdatedDate <= datetime('{endTimeParam}')"
            else:
                patch_date_filter = f"startofday(PatchUpdatedDate) >= startofday(ago(toint({hours} / 24) * 1d))"

            query = f"""
            // Base filter
            let Base =
               Resource_Compliance
                | where ObjectName == "Patch";
            // UpdatedDate per batch, limited by time window
            let PatchTimes =
                Base
                | where CounterName == "UpdatedDate"
                | extend PatchUpdatedDate = todatetime(Value)
                | where isnotnull(PatchUpdatedDate) and {patch_date_filter}
                | project ResourceName, LastUpdated, PatchUpdatedDate;
            // Patch window name per batch
            let PatchNames =
                Base
                | where CounterName == "PatchWindow"
                | project ResourceName, LastUpdated, PatchWindow = Value;
            // Collection-aware statuses (JSON payload)
            let PatchStatusesRaw =
                Base
                | where CounterName == "CollectionStatus"
                | extend payload = parse_json(Value)
                | extend Collection = tostring(payload.collection), Status = tostring(payload.status), ig = ingestion_time()
                | project ResourceName, LastUpdated, Collection, Status, ig;
            // Restrict statuses to in-window batches by inner joining to PatchTimes first
            let PatchStatuses =
                PatchStatusesRaw
                | join kind=inner PatchTimes on ResourceName, LastUpdated
                | project ResourceName, LastUpdated, Collection, Status, ig;
            // Resolve duplicates per collection within a batch (worst-case precedence)
            let ResolvedStatuses =
                PatchStatuses
                | summarize status_any_not_installed = any(Status == "Not Installed"), latest_status = arg_max(ig, Status).Status by ResourceName, LastUpdated, Collection
                | extend Status = iff(status_any_not_installed, "Not Installed", "Installed");
            PatchTimes
            | join kind=leftouter ResolvedStatuses on ResourceName, LastUpdated
            | join kind=leftouter PatchNames on ResourceName, LastUpdated
            | project
                ResourceName,
                PatchWindow,
                PatchUpdatedDate,
                Collection,
                Status
            """
        else:
            return {"status": 200, "Data": [], "meta": {}, "error": None}, 200
 
        df = readFromADX(query)

        events = []
 
        for _, row in df.iterrows():
            resourceName = row.get("ResourceName", "")
            server = None
            appCI = None
            if isinstance(resourceName, str) and resourceName:
                parts = resourceName.split("/")
                try:
                    server = parts[parts.index("ServerName") + 1]
                except Exception:
                    server = None
                try:
                    appCI = parts[parts.index("ApplicationCI") + 1]
                except Exception:
                    appCI = None
 
            if eventType == "Backup":
                events.append({
                    "eventType": "Backup",
                    "serverName": server,
                    "applicationCI": appCI,
                    "startTime": row["BackupStartTime"].strftime("%Y-%m-%dT%H:%M:%SZ") if pandas.notna(row["BackupStartTime"]) else None,
                    "endTime": row["BackupEndTime"].strftime("%Y-%m-%dT%H:%M:%SZ") if pandas.notna(row["BackupEndTime"]) else None,
                    "backupStatus": row["BackupStatus"]
                })
            elif eventType == "Patch":
                events.append({
                    "eventType": "Patch",
                    "serverName": server,
                    "applicationCI": appCI,
                    "timestamp": row["PatchUpdatedDate"].strftime("%Y-%m-%dT%H:%M:%SZ") if pandas.notna(row["PatchUpdatedDate"]) else None,
                    "patchStatus": row.get("Status"),
                    "patchWindow": row.get("PatchWindow"),
                    "collection": row.get("Collection")
                })

        return {"status": 200, "Data": events, "meta": {}, "error": None}, 200
 
    except Exception as ex:
        # Existing error handling
        info = exceptioninfo(ex)
        insert_data(info)
        return error_response(500, "Failed to fetch resource compliance events", detail=info, exc=ex)
 