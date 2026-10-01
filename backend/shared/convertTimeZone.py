from datetime import datetime, timedelta
import pytz

def convertPstToUtc(pst_datetime_str):
    
    pst_zone = pytz.timezone("America/Los_Angeles")
    utc_zone = pytz.UTC

    # Parse datetime string
    naive_dt = datetime.strptime(pst_datetime_str, "%Y-%m-%d %H:%M:%S")

    # Localize to PST/PDT
    local_dt = pst_zone.localize(naive_dt)

    # Convert to UTC
    return local_dt.astimezone(utc_zone)

def convertIstToUtc(ist_datetime_str):
    
    ist_zone = pytz.timezone("Asia/Kolkata")
    utc_zone = pytz.UTC

    naive_dt = datetime.strptime(ist_datetime_str, "%Y-%m-%d %H:%M:%S")

    local_dt = ist_zone.localize(naive_dt)
    print(local_dt)
    
    return local_dt.astimezone(utc_zone)

def convertUtcToPst(utc_datetime_str):
    
    if(utc_datetime_str==None):
        return None
    
    naive_dt = datetime.strptime(utc_datetime_str, "%Y-%m-%d %I:%M:%S %p")

    # Localize as UTC
    utc_zone = pytz.UTC
    utc_dt = utc_zone.localize(naive_dt)

    # Convert to Pacific Time (DST-aware: PST in winter, PDT in summer)
    pacific_tz = pytz.timezone("America/Los_Angeles")
    pacific_dt = utc_dt.astimezone(pacific_tz)

    # Return in the same format
    return pacific_dt.strftime("%Y-%m-%d %I:%M:%S %p")
