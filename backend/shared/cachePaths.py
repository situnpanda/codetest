"""Shared filesystem paths for cached JSON data.

Extracted verbatim from main.py so route slices can import the same cache-file
locations. Paths resolve relative to the backend root (parent of this package).
"""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend root
modules_path = os.path.join(BASE_DIR, "Modules")
cache_path = os.path.join(modules_path, "cache")

incidentListJsonPath = os.path.join(cache_path, "incidentList.json")
serverListJsonPath = os.path.join(cache_path, "serverList.json")
alertListJsonPath = os.path.join(cache_path, "alertsList.json")
alertInfraListJsonPath = os.path.join(cache_path, "serverMetrics.json")
applicationListJsonPath = os.path.join(cache_path, "applicationList.json")
userToSupportGroupMappingJsonPath = os.path.join(cache_path, "userToSupportGroupMappingList.json")
