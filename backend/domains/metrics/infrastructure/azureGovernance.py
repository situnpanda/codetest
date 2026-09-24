import pandas 
import os
from flask import Flask, jsonify
import json

def tagCompliance_Subscription(subscriptionId, subscriptionList, app):
    subs = subscriptionId.split(",")
    print(subs)
    allResources = []
   
    for subscription in subs:
        fileName = subscriptionList.get(subscription)
        print(fileName)
        if fileName is None:
            #allResources.append({'error': f'Invalid subscription ID: {subscription}'})
            continue
        file_path = os.path.join(app.static_folder, fileName)
       
        try:    
            if os.path.isfile(file_path):
                with open(file_path, 'r') as file:
                    try:
                        data = json.load(file)                
                        filtered_resources = []    
                        for resource in data["value"]:        
                            if resource.get('type') == "Microsoft.Compute/virtualMachines":
                                vm_info = {
                                    'name': resource.get('name'),
                                    "applicationId": resource["tags"].get("applicationID") if "applicationID" in resource["tags"] else (" "),
                                    "supportGroup": resource["tags"].get("supportGroup") if "supportGroup" in resource["tags"] else (" "),
                                    "costCenter": resource["tags"].get("costCenter") if "costCenter" in resource["tags"] else (" "),
                                    "appFamily": resource["tags"].get("appFamily") if "appFamily" in resource["tags"] else (" "),
                                    "applicationCI": resource["tags"].get("applicationCI") if "applicationCI" in resource["tags"] else (" "),
                                    "backupType": resource["tags"].get("backupType") if "backupType" in resource["tags"] else (" "),
                                    "maintenanceStatus": resource["tags"].get("maintenanceStatus") if "maintenanceStatus" in resource["tags"] else (" "),
                                    "maintenanceWindow": resource["tags"].get("maintenanceWindow") if "maintenanceWindow" in resource["tags"] else (" "),
                                    "managedBy": resource["tags"].get("managedBy") if "managedBy" in resource["tags"] else (" "),
                                    "environment": resource["tags"].get("environment") if "environment" in resource["tags"] else (" ")
                                    #'tags': resource.get('tags', {})
                                }
                                filtered_resources.append(vm_info)
                               
                        allResources.extend(filtered_resources)
                        print(filtered_resources)                  
                       
                        #return jsonify(resources), 200
                    except json.JSONDecodeError as e:
                        allResources.append({'error': f'Invalid JSON format in file: {fileName}'})
                        return jsonify({'error': 'Invalid JSON format in file'}), 500
            else:
                print("")
                allResources.append({'error': f'File not found: {fileName}'})
                #return jsonify({'error': 'File not found'}), 404
                continue
        except Exception as ex:
            print()
            allResources.append({'error': f'Error loading file {fileName}: {str(ex)}'})
            #return jsonify({'error': f'Error loading file: {str(ex)}'}), 500
            continue
    
    df = pandas.DataFrame(allResources)
    df = df.where(pandas.notnull(df), None)
    return df
    print(df)

def tagCompliance_ServerName(serverName, subscriptionList, app):
    allResources = []
    serverList = serverName.lower().split(',')
    for subscription in subscriptionList:
        fileName = subscriptionList.get(subscription)
        # print(fileName)
        if fileName is None:
            #allResources.append({'error': f'Invalid subscription ID: {subscription}'})
            continue
        file_path = os.path.join(app.static_folder, fileName)
       
        try:    
            if os.path.isfile(file_path):
                with open(file_path, 'r') as file:
                    try:
                        data = json.load(file)                
                        filtered_resources = []    
                        for resource in data["value"]: 

                            if resource.get('type') == "Microsoft.Compute/virtualMachines" and ("'"+resource.get('name').lower()+"'" in serverList):
                                print("'"+resource.get('name').lower()+"'")
                                vm_info = {
                                    'name': resource.get('name'),
                                    "applicationId": resource["tags"].get("applicationID") if "applicationID" in resource["tags"] else (" "),
                                    "supportGroup": resource["tags"].get("supportGroup") if "supportGroup" in resource["tags"] else (" "),
                                    "costCenter": resource["tags"].get("costCenter") if "costCenter" in resource["tags"] else (" "),
                                    # "appFamily": resource["tags"].get("appFamily") if "appFamily" in resource["tags"] else (" "),
                                    "applicationCI": resource["tags"].get("applicationCI") if "applicationCI" in resource["tags"] else (" "),
                                    "backupType": resource["tags"].get("backupType") if "backupType" in resource["tags"] else (" "),
                                    "maintenanceStatus": resource["tags"].get("maintenanceStatus") if "maintenanceStatus" in resource["tags"] else (" "),
                                    "maintenanceWindow": resource["tags"].get("maintenanceWindow") if "maintenanceWindow" in resource["tags"] else (" "),
                                    "environment": resource["tags"].get("environment") if "environment" in resource["tags"] else (" ")
                                    #'tags': resource.get('tags', {})
                                    # "managedBy": resource["tags"].get("managedBy") if "managedBy" in resource["tags"] else (" "),
                                }
                                filtered_resources.append(vm_info)
                               
                        allResources.extend(filtered_resources)
                                         
                       
                        #return jsonify(resources), 200
                    except json.JSONDecodeError as e:
                        allResources.append({'error': f'Invalid JSON format in file: {fileName}'})
                        return jsonify({'error': 'Invalid JSON format in file'}), 500
            else:
                print("")
                allResources.append({'error': f'File not found: {fileName}'})
                #return jsonify({'error': 'File not found'}), 404
                continue
        except Exception as ex:
            print()
            allResources.append({'error': f'Error loading file {fileName}: {str(ex)}'})
            #return jsonify({'error': f'Error loading file: {str(ex)}'}), 500
            continue
    
    df = pandas.DataFrame(allResources)
    df = df.where(pandas.notnull(df), None)
    return df