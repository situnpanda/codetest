import os
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential, AzureCliCredential, ManagedIdentityCredential

def connectToKeyVault(name):

    kvUri = "https://akv-monitoring-01.vault.azure.net/"
    # credential = AzureCliCredential()
    credential = DefaultAzureCredential()
    #credential = ManagedIdentityCredential(client_id='015ad614-f9a5-4333-83b4-b71c01c393d8')
    client = SecretClient(vault_url=kvUri, credential=credential)
    retrieved_secret = client.get_secret(name)
    return retrieved_secret.value
