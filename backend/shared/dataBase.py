import pyodbc
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from shared.keyVault import connectToKeyVault
import traceback
import datetime
import pytz
import os

from shared.appinsights_logger import log_dependency

# ---------------------------------------------------------------------------
# Snowflake Aero DW connection settings.
#
# Aero was migrated off SQL Server (aerodw.database.windows.net / AeroDw) to
# Snowflake. Authentication uses key-pair (RSA .p8) whose PEM lives in the
# Key Vault secret referenced below.
# ---------------------------------------------------------------------------
SNOWFLAKE_AERO_ACCOUNT = "psjh-prod.west-us-2.azure"
SNOWFLAKE_AERO_USER = "servCRCAMonitoring@providence.org"
SNOWFLAKE_AERO_DATABASE = "ESI_AERO_PROD_DB"
SNOWFLAKE_AERO_SCHEMA = "REPORTING"
SNOWFLAKE_AERO_WAREHOUSE = "TEO_ESI_WH_S"
SNOWFLAKE_AERO_ROLE = "PUBLIC"
SNOWFLAKE_AERO_KEY_KV_SECRET = "servCRCAMonitoringAero-SnowflakeKey"
SNOWFLAKE_AERO_PRIVATE_KEY_PASSPHRASE = os.environ.get("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE")

# Cached DER-encoded private key so we don't re-fetch from Key Vault every query.
_aero_private_key_der = None


def _load_aero_private_key():
    """Load and cache the Aero Snowflake private key from Key Vault (PEM -> DER)."""
    global _aero_private_key_der
    if _aero_private_key_der is not None:
        return _aero_private_key_der
    pem_text = connectToKeyVault(SNOWFLAKE_AERO_KEY_KV_SECRET)
    p_key = serialization.load_pem_private_key(
        pem_text.encode("utf-8"),
        password=(SNOWFLAKE_AERO_PRIVATE_KEY_PASSPHRASE.encode("utf-8")
                  if SNOWFLAKE_AERO_PRIVATE_KEY_PASSPHRASE else None),
    )
    _aero_private_key_der = p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return _aero_private_key_der



def queryAeroSnowflake(query):
    """Run a read-only query against Aero on Snowflake and return rows.

    Drop-in replacement for the legacy pattern:
        conn = connectToDw_SQLServerAero(...); rows = queryDw(conn, query)
    Uses key-pair auth. Retries up to 3 times on transient failures.
    """
    private_key = _load_aero_private_key()
    count = 0
    lastError = None
    while count <= 3:
        try:
            with snowflake.connector.connect(
                account=SNOWFLAKE_AERO_ACCOUNT,
                user=SNOWFLAKE_AERO_USER,
                private_key=private_key,
                warehouse=SNOWFLAKE_AERO_WAREHOUSE,
                database=SNOWFLAKE_AERO_DATABASE,
                schema=SNOWFLAKE_AERO_SCHEMA,
                role=SNOWFLAKE_AERO_ROLE,
                client_session_keep_alive=False,
            ) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query)
                    return cursor.fetchall()
        except Exception as ex:
            print(ex)
            lastError = ex
            count += 1
    raise Exception(lastError)


def connectToAeroDw_SqlServerPwd(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("servCRCAMonitoringAero-iTelemetry")
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+";Server="+serverName+";Database="+dbName
    # print(connectionString)
    return connectionString

def connectToDw_SqlServerPwd(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("servCRCAMonitoring-iTelemetry")
   
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+";Server="+serverName+";Database="+dbName
    # print(connectionString)
    return connectionString

def connectToDw(serverName, dbName):
    """ server = 'spidedbsv6c6b60.wa.providence.org\\SPIDER.database.windows.net'
    database = '<database>'
    username = '<username>'
    password = '{<password>}' """

    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";Server="+serverName+";Database="+dbName+";Trusted_Connection=yes"
    return connectionString

def connectToDw_AADpwd(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
    
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+"; Authentication=ActiveDirectoryPassword;Server="+serverName+";Database="+dbName+";applicationintent=readonly"
    #print(connectionString)
    return connectionString

def connectToDw_AADpwd_Write(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
  
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+"; Authentication=ActiveDirectoryPassword;Server="+serverName+";Database="+dbName
    #print(connectionString)
    return connectionString

def connectToDw_SqlServerPwdScom(serverName, dbName, userName):
    # print(userName)
    pwd = connectToKeyVault("CRCAMonitoring-iTelemetry")
   
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+";Server="+serverName+";Database="+dbName
    #print(connectionString)
    return connectionString

def connectToDw_SQLServerAero(serverName, dbName, userName):
    pwd = connectToKeyVault("servCRCAMonitoringAero-iTelemetry")
    driver= '{ODBC Driver 17 for SQL Server}'
    connectionString = "Driver="+driver+";UID="+userName+";PWD="+pwd+";Server="+serverName+";Database="+dbName
    #print(connectionString)
    return connectionString


@log_dependency("SQL", "queryDw", kind="database")  # Logging: capture SQL query timing, row count, and errors
def queryDw(connectionString, query):
    count = 0
    lastError = None
    while(count<=3):
        try:
            with pyodbc.connect(connectionString) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query)
                    rows = cursor.fetchall()
                    return rows
        except Exception as ex:
            print(ex)
            lastError = ex
            count+=1
    # Logging: raise so @log_dependency records this as a failure (like log_performance)
    raise Exception(lastError)

@log_dependency("SQL", "updateDw", kind="database")
def updateDw(connectionString, query, data):
    count = 0
    print(type(data))
    while(count<=3):
        try:
            with pyodbc.connect(connectionString) as conn:
                with conn.cursor() as cursor:
                    if('Update' in query):
                        cursor.execute(query, data)
                    else:
                        cursor.executemany(query, data)
                    
                    conn.commit()
                    rowsAffected = cursor.rowcount
                    print(rowsAffected)
                    print("Successful")
                    return "Successful"
                    
        except Exception as ex:
            print(ex)
            count+=1
            if(count>3):
                raise Exception(ex)
    return "Failed"

@log_dependency("SQL", "deleteDw", kind="database")
def deleteDw(connectionString, query, data):
    count = 0
    while(count<=3):
        try:
            with pyodbc.connect(connectionString) as conn:
                with conn.cursor() as cursor:
                    cursor.executemany(query, data)
                    conn.commit()
                    rowsAffected = cursor.rowcount
                    print(rowsAffected)
                    return "Successful"
        except Exception as ex:
            print(ex)
            count+=1
            if(count>3):
                raise Exception(ex)
    return "Failed"

def exceptioninfo(e, query="n/a"):
    e_traceback = traceback.extract_tb(e.__traceback__)[-1]
    # timestamp = datetime.datetime.now(pytz.timezone('America/Los_Angeles')).strftime("%Y-%m-%d %H:%M:%S PST")
    username = ""
    page_name = os.path.basename(e_traceback.filename)
    line_number = e_traceback.lineno
    line_code = e_traceback.line
    exception_message = str(e)
    formatted_message = (
        f"Exception occurred in the following line: \n"
        f"    {line_code}\n"
        f" Query if any:   {query}\n"
        f"Error message: {exception_message}"
    )

    return {
        # "Timestamp": timestamp,
        "UserName": username,
        "PageName": page_name,
        "LineNumber": line_number,
        "ExceptionMessage": formatted_message,
    }
    
def insert_data(info):
    connectToCrcaMonitoring = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    with pyodbc.connect(connectToCrcaMonitoring) as conn:
        with conn.cursor() as cursor:
            insert_query = """
            INSERT INTO ExceptionLogs (Username, PageName, LineNumber, ExceptionMessage)
            VALUES (?, ?, ?, ?)
            """
            cursor.execute(insert_query, (
                info["UserName"],
                info["PageName"],
                info["LineNumber"],
                info["ExceptionMessage"]))
            conn.commit()
            print("Inserted successfully") 
            
@log_dependency("SQL", "insertDw", kind="database")
def insertDw(connectionString, query, data):
    try:
        with pyodbc.connect(connectionString) as conn:
            with conn.cursor() as cursor:
                i=0
                while(i<len(data)):
                    end = len(data) if i+1000>len(data) else i+1000
                    cursor.executemany(query, data[i:end])
                    i=end
                    print("Inserted successfully")
                conn.commit()
                return "Success"
    except Exception as ex:
        print(ex)
        raise Exception(ex)
        
        
    