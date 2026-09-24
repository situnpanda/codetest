import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

from shared.filters import getApplicationMetaData
from datetime import datetime
import pytz
from shared.dataBase import connectToDw_AADpwd_Write, insertDw

def updateDB(df, time):
    print(df.isnull().sum())
    df = df.dropna()
    print(df.isnull().sum())
    df["Last Updated"] = time
    try:
        columns = df.columns
        st = ",".join([("@"+col.replace(" ","")+"= ?") for col in columns])
        
        data = [tuple([row[col] for col in columns]) for ind, row in df.iterrows()]
        
        connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net","crcamonitoring","servCRCAMonitoring@providence.org")
        
        sqlQuery = f""" 
            EXEC UpdateApplicationList {st}
        """
        print(sqlQuery)
        print(data[0])
        res = insertDw(connectionString, sqlQuery, data)
        print(res)
    except Exception as ex:
        print("Failed to Update the DB\n "+ ex)
    
def caching_appList():
    
    filter = {'appFamily': ['All'], 'appCI': ['All'], 'managedByGroup': ['All'], 'supportGroup': ['All']}
    datetime_format = "%Y-%m-%d %I:%M:%S %p"
    time = datetime.now()
    pst = pytz.timezone('America/Los_Angeles')
    time = time.astimezone(pst)
    time = time.strftime(datetime_format)
    
    # Update DB
    df = getApplicationMetaData(filter, "dataFrame")
    if(len(df)):
        updateDB(df,time)
    else:
        print("Empty")
    
caching_appList()