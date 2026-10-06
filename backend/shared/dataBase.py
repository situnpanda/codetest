import pyodbc
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from shared.keyVault import connectToKeyVault
import traceback
import datetime
import pytz
import os
import time
import struct
from azure.identity import DefaultAzureCredential,AzureCliCredential

from shared.appinsightsLogger import log_dependency

# Disable ODBC Driver-level connection pooling.
# In AKS, Linkerd proxy and Azure SQL's idle timeout (~30 min) silently kill pooled TCP
# connections. pyodbc then tries SQLEndTran(SQL_ROLLBACK) on a dead socket -> 08S01
# Communication link failure. Each request creates a fresh connection instead.
pyodbc.pooling = False

# ODBC constant for AAD token auth -- defined once to avoid duplication
SQL_COPT_SS_ACCESS_TOKEN = 1256

# Global credential + token cache -- token refreshed only when within 60s of expiry
_credential = None
_token_cache = {"token": None, "expires_on": 0}


def get_azure_sql_token():
    """Get Azure SQL access token, refreshing only when within 60s of expiry."""
    global _credential, _token_cache
    if _credential is None:
        _credential = DefaultAzureCredential()
        # _credential = AzureCliCredential()
    if time.time() > _token_cache["expires_on"] - 60:
        t = _credential.get_token("https://database.windows.net/.default")
        token_bytes = t.token.encode("UTF-16-LE")
        _token_cache["token"] = struct.pack(f'<I{len(token_bytes)}s', len(token_bytes), token_bytes)
        _token_cache["expires_on"] = t.expires_on
        print("[dataBase] Azure SQL token refreshed")
    return _token_cache["token"]


class _AadConn:
    """Lazy managed-identity connection factory.

    Returned by connectToDw_AADpwd*. Holds only a connection string; the real
    token-authenticated pyodbc connection is opened fresh on each use. This is
    important because several modules call connectToDw_AADpwd(...) at import time
    -- returning a live connection there would force a DB connect + token fetch
    during import (failing at startup when no token is available) and would also
    cause shared-connection reuse errors when reused across requests.
    """
    __slots__ = ("connection_string",)

    def __init__(self, connection_string):
        self.connection_string = connection_string

    def connect(self):
        return pyodbc.connect(
            self.connection_string,
            attrs_before={SQL_COPT_SS_ACCESS_TOKEN: get_azure_sql_token()},
        )


def _open(connectionString):
    """Open a fresh connection from a string, an _AadConn marker, or return a live conn as-is."""
    if isinstance(connectionString, _AadConn):
        return connectionString.connect()
    if isinstance(connectionString, str):
        return pyodbc.connect(connectionString)
    return connectionString


def openConnection(connectionString):
    """Open a DB connection from a connection string or _AadConn marker.

    Caller is responsible for closing the returned connection.
    """
    return _open(connectionString)


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
    """Managed-identity (read-only) connection factory. Returns a lazy _AadConn marker."""
    driver = '{ODBC Driver 17 for SQL Server}'
    connectionString = f"Driver={driver};Server={serverName};Database={dbName};applicationintent=readonly"
    return _AadConn(connectionString)

def connectToDw_AADpwd_Write(serverName, dbName, userName):
    """Managed-identity (read-write) connection factory. Returns a lazy _AadConn marker."""
    driver = '{ODBC Driver 17 for SQL Server}'
    connectionString = f"Driver={driver};Server={serverName};Database={dbName}"
    return _AadConn(connectionString)

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
def queryDw(connectionString, query, params=None):
    count = 0
    lastError = None
    while(count<=3):
        conn = None
        try:
            conn = _open(connectionString)
            with conn.cursor() as cursor:
                if params is not None:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                rows = cursor.fetchall()
                return rows
        except Exception as ex:
            print(ex)
            lastError = ex
            count+=1
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
    # Logging: raise so @log_dependency records this as a failure (like log_performance)
    raise Exception(lastError)

@log_dependency("SQL", "updateDw", kind="database")
def updateDw(connectionString, query, data):
    count = 0
    print(type(data))
    while(count<=3):
        conn = None
        try:
            conn = _open(connectionString)
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
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
    return "Failed"

@log_dependency("SQL", "deleteDw", kind="database")
def deleteDw(connectionString, query, data):
    count = 0
    while(count<=3):
        conn = None
        try:
            conn = _open(connectionString)
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
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
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
    connectionString = connectToDw_AADpwd_Write("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
    conn = None
    try:
        conn = _open(connectionString)
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
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

@log_dependency("SQL", "insertDw", kind="database")
def insertDw(connectionString, query, data):
    conn = None
    try:
        conn = _open(connectionString)
        with conn.cursor() as cursor:
            i=0
            while(i<len(data)):
                end = len(data) if i+1000>len(data) else i+1000
                cursor.executemany(query, data[i:end])
                conn.commit()   # commit each batch -- partial progress preserved on failure
                print("Inserted successfully")
                i=end
            return "Success"
    except Exception as ex:
        print(ex)
        raise Exception(ex)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        
        
    