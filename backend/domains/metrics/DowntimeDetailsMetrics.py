from flask import Blueprint, request, jsonify
import json
import pandas
from shared.ADX import readFromADX
from shared.dataBase import queryDw, connectToDw_AADpwd, insert_data, exceptioninfo

from shared.appinsights_logger import log_performance, error_response


downtimeDetails = Blueprint('downtimeDetails', __name__)

@downtimeDetails.route('/api/downtimeEvents', methods=['POST'])
@log_performance()
def get_change_incident_events():
    try:
        dataPost = request.get_json() or {}
        hours = int(dataPost.get('hours', 24))
        eventType = dataPost.get('eventType')   # "Change", "Major Incident", or "Service Health"

        # Support explicit UTC start/end time range; fall back to hours-based lookback
        startTimeParam = dataPost.get('startTime')  # Expected UTC ISO string
        endTimeParam = dataPost.get('endTime')      # Expected UTC ISO string
        use_explicit_range = bool(startTimeParam and endTimeParam)
        strictStartFilter = bool(dataPost.get('strictStartFilter', False))

        if use_explicit_range:
            window_start = f"datetime('{startTimeParam}')"
            window_end = f"datetime('{endTimeParam}')"
        else:
            window_start = f"ago({hours}h)"
            window_end = "now()"

        if eventType not in ["Change", "Major Incident", "Service Health"]:
            return error_response(400, "Invalid eventType")

        if eventType == "Service Health":
            objectName = "Service Health Issue"

            query = f"""
                let windowStart = {window_start};
                let windowEnd = {window_end};
                Downtime_Details
                | where ObjectName == "{objectName}"
                | where
                    (OpenedAt >= windowStart and OpenedAt <= windowEnd)
                    or (ClosedAt >= windowStart and ClosedAt <= windowEnd)
                    or (
                        OpenedAt < windowStart
                        and (isnull(ClosedAt) or ClosedAt >= windowStart)
                    )
                | project
                    Number,
                    ShortDescription,
                    OpenedAt,
                    ClosedAt,
                    PriorityLabel,
                    Status
                | order by OpenedAt desc
            """
            print("The query is", query)
            df = readFromADX(query)

            events = []
            for _, row in df.iterrows():
                startTime = None
                if pandas.notna(row["OpenedAt"]):
                    dt = pandas.to_datetime(row["OpenedAt"], utc=True)
                    startTime = dt.strftime("%Y-%m-%dT%H:%M:%SZ")

                endTime = None
                if pandas.notna(row["ClosedAt"]):
                    dt = pandas.to_datetime(row["ClosedAt"], utc=True)
                    endTime = dt.strftime("%Y-%m-%dT%H:%M:%SZ")

                # Parse the JSON stored in ShortDescription
                try:
                    details = json.loads(row["ShortDescription"])
                except (json.JSONDecodeError, TypeError):
                    details = {}

                events.append({
                    "eventType": "Service Health",
                    "number": row["Number"],
                    "title": details.get("title", ""),
                    "serviceHealthEventType": details.get("eventType", ""),
                    "description": details.get("description", ""),
                    "recommendedActions": details.get("recommendedActions", ""),
                    "affectedSubscriptions": details.get("affectedSubscriptions", []),
                    "startTime": startTime,
                    "endTime": endTime,
                    "priority": row["PriorityLabel"],
                    "status": row["Status"]
                })
            print("the events are ", events)
            return {"status": 200, "Data": events, "meta": {}, "error": None}, 200

        # Change Request / Major Incident path
        objectName = "Change Request" if eventType == "Change" else "Major Incident"

        if strictStartFilter:
            time_where = "| where OpenedAt >= windowStart and OpenedAt <= windowEnd"
        else:
            time_where = """| where
                (OpenedAt >= windowStart and OpenedAt <= windowEnd)
                or (ClosedAt >= windowStart and ClosedAt <= windowEnd)
                or (
                    OpenedAt < windowStart
                    and (isnull(ClosedAt) or ClosedAt >= windowStart)
                )"""

        query = f"""
                let windowStart = {window_start};
                let windowEnd = {window_end};
            Downtime_Details
            | where ObjectName == "{objectName}"
            {time_where}
            | project
                Number,
                ApplicationCI,
                ShortDescription,
                OpenedAt,
                ClosedAt,
                PriorityLabel,
                Status,
                AdditionalInformation
            | order by OpenedAt desc
        """
        df = readFromADX(query)
        print("the MI df is", df)

        events = []

        for _, row in df.iterrows():
            # Ensure timestamps are UTC-aware before converting to ISO format
            startTime = None
            if pandas.notna(row["OpenedAt"]):
                dt = pandas.to_datetime(row["OpenedAt"], utc=True)
                startTime = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            endTime = None
            if pandas.notna(row["ClosedAt"]):
                dt = pandas.to_datetime(row["ClosedAt"], utc=True)
                endTime = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            events.append({
                "eventType": eventType,
                "number": row["Number"],
                "applicationCI": row["ApplicationCI"],
                "description": row["ShortDescription"],
                "startTime": startTime,
                "endTime": endTime,
                "priority": row["PriorityLabel"],
                "status": row["Status"],
                "additionalInformation": row["AdditionalInformation"]
            })
        print("the major incident events are ", events)
        return {"status": 200, "Data": events, "meta": {}, "error": None}, 200

    except Exception as ex:
        # Existing error handling
        info = exceptioninfo(ex)
        insert_data(info)
        return error_response(500, "Failed to fetch downtime details", detail=info, exc=ex)
