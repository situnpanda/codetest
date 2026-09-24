param(
    [string]$Password
)

$servers = @("ad.providence.org", "wa.providence.org", "or.providence.org")
$username = "phswa\servcrcamonitoring"

Write-Output $Password
# Convert password to SecureString
$securePassword = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($username, $securePassword)

# Check if JSON output is requested
$outputJson = $args -contains "-OutputJson"

$results = foreach ($server in $servers) {
    # Only write host messages if not outputting JSON
    if (-not $outputJson) {
        Write-Host "Processing server: $server" -ForegroundColor Cyan
    }
    
    # Filter: Enabled users, SamAccountName starts with "serv", AND Password does NOT never expire
    Get-ADUser -Server $server -Credential $cred -Filter {Enabled -eq $True -and SamAccountName -like "serv*" -and PasswordNeverExpires -eq $False} -Properties "DisplayName", "msDS-UserPasswordExpiryTimeComputed", "UserPrincipalName", "Manager", "Department", "PasswordNeverExpires" | ForEach-Object {
        
        $managerName = "N/A"
        $managerDept = "N/A"
        
        if ($_.Manager) {
            try {
                $managerDN = $_.Manager
                
                # Extract domain from DN: DC=ad,DC=providence,DC=org -> ad.providence.org
                if ($managerDN -match "(DC=.+)$") {
                    $managerServer = ($Matches[1] -replace "DC=", "" -replace ",", ".")
                } else {
                    $managerServer = "providence.org:3268"
                }
                
                $managerInfo = Get-ADUser $managerDN -Server $managerServer -Properties DisplayName, Department -ErrorAction Stop
                
                if ($managerInfo) {
                    $managerName = if ($managerInfo.DisplayName) { $managerInfo.DisplayName } else { "N/A" }
                    $managerDept = if ($managerInfo.Department) { $managerInfo.Department } else { "N/A" }
                }
            } catch {
                # Keep default N/A values
            }
        }
        
        # Extract user's domain from DistinguishedName
        $userDomain = "N/A"
        if ($_.DistinguishedName -match "(DC=.+)$") {
            $userDomain = ($Matches[1] -replace "DC=", "" -replace ",", ".")
        }
        
        # Handle empty/null ExpiryDate
        $expiryDate = "Never Expires"
        $expiryTimeComputed = $_."msDS-UserPasswordExpiryTimeComputed"
        if ($expiryTimeComputed -and $expiryTimeComputed -gt 0 -and $expiryTimeComputed -lt [datetime]::MaxValue.ToFileTime()) {
            try {
                $expiryDate = [datetime]::FromFileTime($expiryTimeComputed)
            } catch {
                $expiryDate = "Never Expires"
            }
        }
        
        [PSCustomObject]@{
            SamAccountName    = $_.SamAccountName
            APMNumber         = $_.surname
            Email             = $_.UserPrincipalName
            UserDomain        = $userDomain
            ManagerName       = $managerName
            ManagerDepartment = $managerDept
            ExpiryDate        = $expiryDate
        }
    }
}

# Filter by Manager Department containing "crca" or "Clinical & Revenue Cycle Applications"
$filteredResults = $results | Where-Object {
    $_.ManagerDepartment -match "crca" -or $_.ManagerDepartment -match "Clinical & Revenue Cycle Applications"
}

# Check if called from Python (looking for -OutputJson parameter)
if ($outputJson) {
    # Output as JSON for Python consumption (no extra messages)
    $filteredResults | ConvertTo-Json -Depth 10
} else {
    # Traditional CSV export
    $filteredResults | Export-Csv -Path "c:\itelemetry5\servaccpass-all.csv" -NoTypeInformation
    
    Write-Host "`nTotal Records Found: $($results.Count)" -ForegroundColor Green
    Write-Host "Filtered Records (CRCA): $($filteredResults.Count)" -ForegroundColor Green
    Write-Host "Export Complete!" -ForegroundColor Green
}