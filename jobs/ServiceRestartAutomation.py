

import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "backend"
sys.path.append(str(root))

import time
import smtplib
import subprocess
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import pyodbc
from shared.keyVault import connectToKeyVault
from shared.dataBase import insert_data, exceptioninfo

PS_TIMEOUT = 120


def is_gmsa(service_account):
    """gMSA accounts end with '$' (e.g. servAPM0014076$) and have no retrievable password.
    They authenticate via the current process identity (this job must run as the gMSA)."""
    return str(service_account).strip().endswith("$")


def _invoke_remote(server, service, credential_ps, script_block):
    """Run a PowerShell ScriptBlock against a remote server via Invoke-Command.
    When credential_ps is empty (gMSA flow), invoke under the current identity with no
    explicit -Credential; otherwise pass the built PSCredential with Negotiate auth."""
    cred_param = "-Credential $credential -Authentication Negotiate" if credential_ps.strip() else ""
    ps_script = f'''
{credential_ps}
try {{
    $result = Invoke-Command -ComputerName '{server}' {cred_param} -ScriptBlock {{
        param($svcName)
{script_block}
    }} -ArgumentList '{service}' -ErrorAction Stop
    Write-Output $result
}} catch {{
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}}
'''
    return subprocess.run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        capture_output=True, text=True, timeout=PS_TIMEOUT
    )


def check_service_status(server, service, credential_ps):
    """Return the remote service status string (Running / Stopped / NotFound / ERROR...)."""
    script_block = '''
        $service = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($service) { Write-Output $service.Status }
        else { Write-Output "NotFound" }
'''
    result = _invoke_remote(server, service, credential_ps, script_block)
    return result.stdout.strip()


def restart_service(server, service, credential_ps, retry_delays=(60, 180)):
    """Start a remote service with staggered retries.
    Does NOT restart immediately on the first failure — waits before each retry.
    retry_delays = seconds to wait before each subsequent attempt (e.g. 1 min, then 3 min)."""
    script_block = '''
        Start-Service -Name $svcName -ErrorAction Stop
        Start-Sleep -Seconds 5
        $newStatus = (Get-Service -Name $svcName).Status
        Write-Output "Status after restart: $newStatus"
'''
    max_attempts = len(retry_delays) + 1
    for attempt in range(1, max_attempts + 1):
        print(f"  Attempt {attempt}/{max_attempts} to start {service}...")
        result = _invoke_remote(server, service, credential_ps, script_block)
        output = result.stdout.strip()
        error = result.stderr.strip()
        if result.returncode == 0 and "ERROR:" not in output:
            print(f"  ✓ {service} restarted successfully")
            return True
        print(f"  ✗ Attempt {attempt} failed to restart {service}: {error or output}")
        if attempt <= len(retry_delays):
            wait = retry_delays[attempt - 1]
            print(f"  ⏳ Waiting {wait}s before next attempt...")
            time.sleep(wait)
    print(f"  ✗ Giving up on {service} after {max_attempts} attempts")
    return False


def send_email_restarted_services(restarted_services, failed_services=None, recipient="shreya.ghosh@providence.org", server_label=""):
    """Email an HTML restart report (service + server + result) to a single recipient."""
    failed_services = failed_services or []
    timestamp = datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')

    rows = ""
    for svc, srv in restarted_services:
        rows += f"""
        <tr>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;'>{svc}</td>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;'>{srv}</td>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;text-align:center;'>Restarted</td>
        </tr>"""
    for svc, srv in failed_services:
        rows += f"""
        <tr>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;'>{svc}</td>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;'>{srv}</td>
          <td style='padding:10px 14px;border:1px solid #000000;font-size:14px;text-align:center;'>Failed</td>
        </tr>"""

    html = f"""
    <html>
    <body style='margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;color:#000000;'>
      <div style='max-width:640px;margin:0 auto;padding:20px;'>
        <h1 style='margin:0;font-size:20px;font-weight:700;'>iTelemetry - CRCA Monitoring Services</h1>
        <p style='margin:6px 0 0;font-size:15px;font-weight:600;'>Service Restart Report</p>
        <p style='margin:2px 0 20px;font-size:13px;'>{timestamp}</p>
        <p style='margin:0 0 12px;font-size:14px;'>The following service(s) were found stopped:</p>
        <table style='width:100%;border-collapse:collapse;'>
          <thead>
            <tr>
              <th style='padding:10px 14px;border:1px solid #000000;font-size:14px;text-align:left;'>Service Name</th>
              <th style='padding:10px 14px;border:1px solid #000000;font-size:14px;text-align:left;'>Server</th>
              <th style='padding:10px 14px;border:1px solid #000000;font-size:14px;text-align:center;'>Result</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <p style='margin:24px 0 0;font-size:13px;line-height:1.6;'>
          <strong>Note:</strong> This is an automated email, please reach out to
          <a href='mailto:CRCAMonitoringServices@providence.org' style='color:#000000;'>CRCAMonitoringServices@providence.org</a>
          for any queries/suggestions.
        </p>
        <p style='margin:20px 0 0;font-size:13px;line-height:1.6;'>
          Regards,<br>
          <strong>CRCA Monitoring Service Team</strong>
        </p>
      </div>
    </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = "CRCAMonitoringServices@providence.org"
    recipients = [addr.strip() for addr in str(recipient).replace(";", ",").split(",") if addr.strip()]
    msg['To'] = ", ".join(recipients)
    msg['Subject'] = "Alert : Service Restart"
    msg.attach(MIMEText(html, 'html'))

    try:
        with smtplib.SMTP("smtp.providence.org", 25) as server:
            server.sendmail("CRCAMonitoringServices@providence.org", recipients, msg.as_string())
        print(f"✓ Email sent to {', '.join(recipients)}")
    except Exception as e:
        print(f"✗ Failed to send email: {e}")


def fetch_config_rows():
    """Fetch all auto-heal config rows from the table as a list of dicts."""
    try:
        password = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER=sqldb-azure-prod-012.database.windows.net;"
            f"DATABASE=crcamonitoring;"
            f"UID=servCRCAMonitoring@providence.org;"
            f"PWD={password};"
            f"Authentication=ActiveDirectoryPassword;"
        )
        sql = """
            SELECT [ResourceName], [ServiceName], [FQDN], [DependentServerServiceMap],
                   [MaintenanceEnabled], [Email], [ServiceAccountName], [Frequency]
            FROM dbo.ServiceAutoHealConfiguration
            WHERE [Frequency] = 1 and ServiceAccountName = 'servAPM0014076$'
        """
        with pyodbc.connect(conn_str) as conn:
            cursor = conn.cursor()
            cursor.execute(sql)
            cols = [c[0] for c in cursor.description]
            rows = [dict(zip(cols, list(row))) for row in cursor.fetchall()]
        print(f"✓ Fetched {len(rows)} config row(s) from dbo.ServiceAutoHealConfiguration")
        return rows
    except Exception as ex:
        info = exceptioninfo(ex)
        raise Exception(info)


def build_credential_ps(service_account):
    """Build the PowerShell credential block for the remote Invoke-Command.
    - gMSA accounts (name ending in '$') have no password: return an empty block so the
      remote call runs under the current (gMSA) identity. This job must itself be running
      as the gMSA (e.g. via a Scheduled Task) for Kerberos delegation to succeed.
    - Regular service accounts fetch their password from Key Vault."""
    if is_gmsa(service_account):
        return ""

    if "servcrcamonitoring" in str(service_account).lower():
        password = connectToKeyVault("servCRCAMonitoring-AAD-iTelemetry")
    else:
        raise Exception(f"No password source configured for service account: {service_account}")

    if not password:
        raise Exception("Failed to fetch password from Key Vault")

    return f"""
$securePassword = ConvertTo-SecureString '{password}' -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential('{service_account}', $securePassword)
"""


def parse_dependency(dep_map):
    """Parse 'ResourceName,ServiceName' → (ResourceName, ServiceName). Returns None if NA/empty."""
    if not dep_map or str(dep_map).strip().upper() == "NA":
        return None
    parts = str(dep_map).rsplit(",", 1)   
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return None


def handle_service(row, lookup, processed, restarted, failed, notify_emails):
    """Check one service; if down, start its dependency first (once), then start it."""
    key = (row["ResourceName"], row["ServiceName"])
    service = row["ServiceName"]
    server  = row["FQDN"]
    account = row["ServiceAccountName"]

    credential_ps = build_credential_ps(account)

    print(f"\nChecking {service} on {server}...")
    status = check_service_status(server, service, credential_ps)
    print(f"  {service}: {status}")

    if "running" in status.lower():
        print(f"✓ {service} is running. No action needed.")
        processed.add(key)
        return

    dep = parse_dependency(row["DependentServerServiceMap"])
    if dep:
        dep_row = lookup.get(dep)
        if dep_row and dep not in processed:
            dep_service = dep_row["ServiceName"]
            dep_server  = dep_row["FQDN"]
            dep_cred    = build_credential_ps(dep_row["ServiceAccountName"])

            print(f"\n{service} is down. Checking dependency {dep_service} on {dep_server}...")
            dep_status = check_service_status(dep_server, dep_service, dep_cred)
            print(f"  {dep_service}: {dep_status}")

            if "running" not in dep_status.lower():
                print(f"{dep_service} is down — starting it first...")
                ok = restart_service(dep_server, dep_service, dep_cred)
                if ok:
                    restarted.append((dep_service, dep_server))
                    notify_emails.add(dep_row["Email"])  
                    time.sleep(5)
                else:
                    failed.append((dep_service, dep_server))
                    print(f"✗ Could not start {dep_service}. Skipping {service}.")
                    processed.add(dep)
                    return
            processed.add(dep)   
        elif not dep_row:
            print(f"⚠️  Dependency {dep} not found in config table — proceeding without it.")

    print(f"Starting {service} on {server}...")
    ok = restart_service(server, service, credential_ps)
    if ok:
        restarted.append((service, server))
        notify_emails.add(row["Email"])  
    else:
        failed.append((service, server))
    processed.add(key)


def run_auto_heal():
    rows = fetch_config_rows()
    lookup = {(r["ResourceName"], r["ServiceName"]): r for r in rows}

    processed = set()
    restarted, failed = [], []
    notify_emails = set()

    for row in rows:
        key = (row["ResourceName"], row["ServiceName"])

        if str(row["MaintenanceEnabled"]).strip().lower() != "no":
            print(f"⏭️  Skipping {row['ServiceName']} (MaintenanceEnabled={row['MaintenanceEnabled']})")
            continue
        if key in processed:
            print(f"⏭️  Skipping {row['ServiceName']} (already handled as a dependency)")
            continue

        handle_service(row, lookup, processed, restarted, failed, notify_emails)

    # Email each affected recipient — only when a service was actually restarted
    if notify_emails:
        for em in notify_emails:
            send_email_restarted_services(restarted, failed, recipient=em, server_label="dbo.ServiceAutoHealConfiguration")
    else:
        print("\nNo services were restarted — no email sent.")


if __name__ == "__main__":
    try:
        run_auto_heal()
    except Exception as ex:
        print(ex)
        if isinstance(ex.args[0], dict):
            insert_data(ex.args[0])
        else:
            info = exceptioninfo(ex)
            insert_data(info)
