from shared.dataBase import queryDw, connectToDw,exceptioninfo,insert_data
from shared.LogAnalytics import queryInLogAnalytics
from shared.keyVault import connectToKeyVault
from shared.variables import globalVariables
from datetime import datetime, timedelta
import pytz
import pandas
import numpy
from flask import jsonify
from shared.appinsights_logger import error_response
def hospitalList(connectionString):
    # hospitalListQuery = """ Select State, Region, Hospital, [Site Code], Address from HospitalList """
    try:
        hospitalListQuery = """Select Lower([Business Application]) as AppCI, a.[Business Entity], b.[State] FROM ['Hospital To App CI'] a
        Join ['Hospital To State'] b on a.[Business Entity] = b.[Business Entity]
        """
        hospitalList = queryDw(connectionString, hospitalListQuery)
        df_hospitalList = pandas.DataFrame()
        if(len(hospitalList)>0):
            df_hospitalList = pandas.DataFrame(numpy.array(hospitalList), columns=["AppCI", "Hospital", "State"])
        return df_hospitalList
    except Exception as Ex:
        print("Exception in Hospital List Query ",Ex )
        info =exceptioninfo(Ex,hospitalListQuery)
        insert_data(info)
        return error_response(500, "Failed to fetch hospital list", detail=info, exc=Ex)

def hospitalListCount(connectionString):
    try:
        hospitalListQuery = """ Select State, Count([Site Code]) as HospitalCount from HospitalList group by State"""
        hospitalList = queryDw(connectionString, hospitalListQuery)
        df_hospitalList = pandas.DataFrame()
        if(len(hospitalList)>0):
            df_hospitalList = pandas.DataFrame(numpy.array(hospitalList), columns=["State","HospitalCount"])
        return df_hospitalList
    except Exception as Ex:
        print("Exception in Hospital List Count Query ",Ex )
        info =exceptioninfo(Ex,hospitalListQuery)
        insert_data(info)
        return error_response(500, "Failed to fetch hospital list count", detail=info, exc=Ex)

