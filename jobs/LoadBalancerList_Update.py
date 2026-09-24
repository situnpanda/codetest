import sys
from pathlib import Path

# Add the parent of 'parent_folder' to sys.path
root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import json
from datetime import datetime
from shared.keyVault import connectToKeyVault
from shared.dataBase import insertDw, connectToDw_AADpwd_Write, queryDw
from azure.identity import ClientSecretCredential
from azure.mgmt.network import NetworkManagementClient
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import pytz
import numpy as np


def process_subscriptions(data, credential):
    
    all_data = []

    connectionString = connectToDw_AADpwd_Write(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org",
    )

    sqlQueryServers = """
        SELECT
            lower([Subscription ID]) AS SubscriptionId,
            lower([Resource Group])   AS ResourceGroup,
            lower([Server Name])      AS ServerName,
            [Hosting Type]            AS HostingType,
            [Application CI]          AS ApplicationCI
        FROM [Server List]
        WHERE [Last Updated] = (SELECT MAX([Last Updated]) FROM [Server List])
    """

    res_servers = queryDw(connectionString, sqlQueryServers)
    df_servers = pd.DataFrame(np.array(res_servers),
        columns=[
            "SubscriptionId",
            "ResourceGroup",
            "ServerName",
            "HostingType",
            "ApplicationCI",
        ],
    )

    if df_servers.empty:
        print("No servers found in [Server List]; nothing to map LBs to.")
        return pd.DataFrame()

    for resource in data:
        subscription_id = resource.get("subscriptionId")
        sub_lower = subscription_id.lower()
        network_client = NetworkManagementClient(credential, subscription_id)

        for lb in network_client.load_balancers.list_all():
            lb_name = lb.name.lower()
            rg = lb.id.split("/resourceGroups/")[1].split("/")[0].lower()

            df_srv_rg = df_servers[
                (df_servers["SubscriptionId"] == sub_lower)
                & (df_servers["ResourceGroup"] == rg)
            ]

            if df_srv_rg.empty:
                continue

            for _, srv in df_srv_rg.iterrows():
                server_name = srv["ServerName"]
                app_ci = srv["ApplicationCI"]
                hosting_type = srv["HostingType"]

                resource_name = (
                    "SubscriptionID/" + sub_lower
                    + "/ResourceGroup/" + rg
                    + "/SqlServerName/" + server_name
                    + "/LoadBalancerName/" + lb_name
                    + "/ApplicationCI/" + str(app_ci)
                )

                all_data.append(
                    {
                        "Resource Name": resource_name,
                        "Sql Server Name": server_name,
                        "LoadBalancer Name": lb_name,
                        "Subscription ID": sub_lower,
                        "Resource Group": rg,
                        "Application CI": app_ci,
                        "Hosting Type": hosting_type,
                    }
                )

    df = pd.DataFrame(all_data)

    if df.empty:
        print("No load balancers to insert (no LB/server combinations found).")
        return df

    pst = pytz.timezone("America/Los_Angeles")
    current_time = datetime.now(pst)
    formatted_time = current_time.strftime("%Y-%m-%d %I:%M:%S %p")

    df["Last Updated"] = formatted_time
    df["Application CI_lower"] = df["Application CI"].str.lower()

    sqlQuery = """
        Select distinct lower([Application CI])
        from [Application List]
        where [Last Updated] = (Select max([Last Updated]) from [Application List])
    """
    val = queryDw(connectionString, sqlQuery)
    df_appCI = pd.DataFrame(np.array(val), columns=["Application CI_lower"])

    df = (
        df.merge(df_appCI, on="Application CI_lower", how="inner")
        .drop(columns={"Application CI_lower"})
    )

    if not df.empty:
        try:
            required_columns = [
                "Resource Name",
                "Sql Server Name",
                "LoadBalancer Name",
                "Subscription ID",
                "Resource Group",
                "Application CI",
                "Hosting Type",
                "Last Updated",
            ]

            insert_query = """
                MERGE INTO [LoadBalancer List] AS target
                USING (
                    SELECT
                        ? AS [Resource Name],
                        ? AS [Sql Server Name],
                        ? AS [LoadBalancer Name],
                        ? AS [Subscription ID],
                        ? AS [Resource Group],
                        ? AS [Application CI],
                        ? AS [Hosting Type],
                        ? AS [Last Updated]
                ) AS source
                ON lower(target.[Resource Name]) like lower(source.[Resource Name])
                WHEN MATCHED THEN
                    UPDATE SET
                        target.[Application CI] = source.[Application CI],
                        target.[Last Updated]   = source.[Last Updated]
                WHEN NOT MATCHED THEN
                    INSERT (
                        [Resource Name],
                        [Sql Server Name],
                        [LoadBalancer Name],
                        [Subscription ID],
                        [Resource Group],
                        [Application CI],
                        [Hosting Type],
                        [Last Updated]
                    )
                    VALUES (
                        source.[Resource Name],
                        source.[Sql Server Name],
                        source.[LoadBalancer Name],
                        source.[Subscription ID],
                        source.[Resource Group],
                        source.[Application CI],
                        source.[Hosting Type],
                        source.[Last Updated]
                    );
            """

            data_for_insert = []
            for _, row in df.iterrows():
                a = []
                for col in required_columns:
                    a.append(row[col])
                data_for_insert.append(tuple(a))

            res = insertDw(connectionString, insert_query, data_for_insert)
            print("Insert/Merge result:", res)

        except Exception as e:
            print(f"Error inserting data into SQL Server: {e}")
    else:
        print("No data to insert after Application CI filter.")

    return df


if __name__ == "__main__":
    try:
        data = [
            {"subscriptionId": "ab16a144-47d7-45c5-bcb7-8affc988f8e0"},
            {"subscriptionId": "9592c342-d1fb-477e-8e91-ad39bf00933b"},
            {"subscriptionId": "5467bf57-48b4-4930-b3cb-bf039b259d04"},
            {"subscriptionId": "343a7ee0-5081-4024-82fc-498ee61867a9"},
            {"subscriptionId": "6d590d81-bab9-4b9a-b011-090467b5a9a4"},
        ]

        print("Starting LoadBalancerList_Update...")

        tenant_id = "2e319086-9a26-46a3-865f-615bed576786"
        client_id = "e2ff3825-261b-418f-9878-c1c031c4cd2a"
        client_secret = connectToKeyVault("autoServPrin")

        credential = ClientSecretCredential(tenant_id, client_id, client_secret)

        process_subscriptions(data, credential)
    except Exception as e:
        print(f"Error: {e}")