import pandas as pd
import numpy
from shared.dataBase import connectToDw, queryDw, connectToDw_AADpwd,exceptioninfo,insert_data
from flask import jsonify
from shared.appinsightsLogger import error_response

def azureNetworkUtilization(serverName_Cond, timeGenerated, subRg_Cond):
    
        sqlQueryNetworkUtil = f"""Select TimeGenerated, ServerName, SubscriptionId, ResourceGroup, NetworkInTotalMB,NetworkOutTotalMB,InboundFlowsTotal,OutboundFlowsTotal
            from NetworkUtilization where {serverName_Cond}{subRg_Cond}{timeGenerated} order by TimeGenerated desc
            """
        print(sqlQueryNetworkUtil)
        #print(f"SQL Query Executed memory azure: {sqlQueryMemoryUtil}")
        # print(sqlQueryCpuUtil)
        try:
            connectToCrcaMonitoring = connectToDw_AADpwd("sqldb-azure-prod-012.database.windows.net", "crcamonitoring", "servCRCAMonitoring@providence.org")
            df_networkUtil = pd.DataFrame()
            try:
                networkUtilData = queryDw(connectToCrcaMonitoring, sqlQueryNetworkUtil)

                if(len(networkUtilData)>0):
                        df_networkUtil = pd.DataFrame(numpy.array(networkUtilData), columns=["TimeGenerated", "ServerName", "SubscriptionId", "ResourceGroup",  "NetworkInTotalMB","NetworkOutTotalMB","InboundFlowsTotal","OutboundFlowsTotal"])
                        df_networkUtil["TimeGenerated"] = df_networkUtil["TimeGenerated"].dt.strftime('%Y-%m-%d %H:%M:%S')
                        print("in Netowrks")
                        print (df_networkUtil)
                    
                return df_networkUtil
            except Exception as Ex:
                print("Exception in connecting to crcamonitoring database ",Ex )
                info =exceptioninfo(Ex)
                insert_data(info)
                return error_response(500, "Failed to connect to monitoring database", detail=info, exc=Ex)
        except Exception as Ex:
            print("Exception in Azure Network Utilization: ",Ex )
            info =exceptioninfo(Ex,sqlQueryNetworkUtil)
            insert_data(info)
            return error_response(500, "Failed to fetch Azure network utilization", detail=info, exc=Ex)
        