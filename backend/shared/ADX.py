import pandas as pd
from shared.dataBase import insert_data,exceptioninfo
from datetime import datetime
from azure.identity import AzureCliCredential, ManagedIdentityCredential,DefaultAzureCredential
from azure.kusto.data import KustoClient, KustoConnectionStringBuilder, DataFormat
from azure.kusto.ingest import IngestionProperties, IngestionMappingKind, KustoStreamingIngestClient, QueuedIngestClient
from azure.kusto.data.helpers import dataframe_from_result_table

from shared.appinsights_logger import log_dependency

def connectToADX(cluster):
    count = 0
    while count<3:
        try:
            # Connect to Az Account
            # credential = AzureCliCredential()
            credential = DefaultAzureCredential()
            #credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
            # Connect to ADX
            kcsb = KustoConnectionStringBuilder.with_azure_token_credential(cluster, credential)
            read_client = KustoClient(kcsb)
            return read_client
        except Exception as ex:
            count+=1
            if(count==2):
                info = exceptioninfo(ex)
                raise Exception(info)
    
@log_dependency("ADX", "kusto_query")
def readFromADX(query):
    try:
        # ADX Metadata
        cluster = "https://telemetrycrcav2.westus2.kusto.windows.net"
        database = "crca_monitoring_telemetry"
        table = "Server_Metrics_Perf"
        
        # Connect to ADX
        client = connectToADX(cluster)
        
        # Read Data from ADX
        KUSTO_QUERY = f"""set notruncation; {query} """
        print(KUSTO_QUERY)
        result = client.execute_query(database, KUSTO_QUERY)
        
        # Convert to Dataframe
        df = dataframe_from_result_table(result.primary_results[0])
        return df
    except Exception as ex:
        print(ex)
        if isinstance(ex.args[0], dict):
            # insert_data(ex.args[0])
            print("here")
            raise Exception(ex.args[0])
        else:
            info = exceptioninfo(ex)
            print("here1")
            # insert_data(info)
            raise Exception(info)