from shared.dataBase import connectToDw, queryDw, connectToDw_SqlServerPwdScom, connectToDw_AADpwd,exceptioninfo,insert_data
import pandas as pd
import numpy as np
import pytz
from datetime import datetime
from flask import jsonify

def onPremServerStatus(server_names, df_ServerNameAppCI):
    try:
        connectionString_Scom = connectToDw_SqlServerPwdScom("msscodbsPA1A0L0.wa.providence.org","OperationsManager", "CRCAMonitoring")
        try:
            query = f"""
                SELECT
                LOWER(
                    CASE
                    WHEN CHARINDEX('.', bme.DisplayName) > 0
                    THEN LEFT(bme.DisplayName, CHARINDEX('.', bme.DisplayName) - 1)
                    ELSE bme.DisplayName
                    END
                ) AS ServerName
                FROM
                state AS s
                JOIN
                BaseManagedEntity AS bme
                ON s.basemanagedentityid = bme.basemanagedentityid
                WHERE
                s.monitorid IN (
                    SELECT MonitorId
                    FROM Monitor
                    WHERE MonitorName = 'Microsoft.SystemCenter.HealthService.ComputerDown'
                )
                AND LOWER(
                    CASE
                    WHEN CHARINDEX('.', bme.DisplayName) > 0
                    THEN LEFT(bme.DisplayName, CHARINDEX('.', bme.DisplayName) - 1)
                    ELSE bme.DisplayName
                    END
                ) in ({server_names})
                AND s.Healthstate = '3'
                AND bme.IsDeleted = '0'
                ORDER BY
                s.Lastmodified DESC;
                """
            # print(query)
            server_name_list = queryDw(connectionString_Scom, query)
            df_ServerNameHealthState = pd.DataFrame()
            # print(server_name_list)
            # if(len(server_name_list)>0):
            df_ServerNameHealthState = pd.DataFrame(np.array(server_name_list), columns=["ServerName"])

            pst = pytz.timezone('America/Los_Angeles')

            current_time_pst = datetime.now(pst)
            
            df_ServerNameHealthState['Status'] = 'Down'
            # print(df_ServerNameHealthState)
            server_names_set = set(df_ServerNameAppCI['ServerName'][df_ServerNameAppCI['HostingType']!='Cloud'])
            existing_server_names = set(df_ServerNameHealthState['ServerName'])
            
            missing_server_names = server_names_set - existing_server_names
            
            missing_df = pd.DataFrame({
                'ServerName': list(missing_server_names),
                'Status': 'Up',
                'ResourceGroup': '',
                'SubscriptionId': ''
            })

            df_ServerNameHealthState = pd.concat([df_ServerNameHealthState, missing_df], ignore_index=True)
            df_ServerNameHealthState['HostingType'] = 'OnPremise'
            
            # df_ServerNameHealthState['TimeGenerated'] = current_time_pst
            # df_ServerNameHealthState['TimeGenerated'] = df_ServerNameHealthState['TimeGenerated'].dt.strftime('%Y-%m-%d%I:%M %p')
            return df_ServerNameHealthState
        except Exception as Ex:
            print("Exception in connecting to Scom database ",Ex )
            info =exceptioninfo(Ex)
            insert_data(info)
            return jsonify({'error':str(Ex)}),500
    except Exception as Ex:
        print("Exception in OnPrem Server Status: ",Ex )
        info =exceptioninfo(Ex,query)
        insert_data(info)
        return jsonify({'error':str(Ex)}),500
