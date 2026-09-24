"""Major Incident analysis: fetch MIs, summarize + categorize, raise ADO stories for 'Others'."""
 
import os
import re
import sys
import json
import base64
from pathlib import Path

# Add the backend root (parent of "Batch Jobs") to sys.path so the Modules package resolves.
sys.path.append(str(Path(__file__).resolve().parents[1] / "backend"))

import requests
import pandas as pd
import numpy as np
import pytz
from datetime import datetime, timedelta
 
from openpyxl import load_workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
 
from openai import AuthenticationError, AzureOpenAI
 
from shared.dataBase import connectToDw_AADpwd, connectToDw_SqlServerPwd, queryDw
from shared.keyVault import connectToKeyVault

 
 
def load_env_file(env_path):
    """Load KEY=VALUE pairs from a .env-style file into os.environ (no override)."""
    if not os.path.exists(env_path):
        print(f"  ⚠️  env file not found: {env_path}")
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))
 
 
load_env_file(os.path.join(os.path.dirname(os.path.abspath(__file__)), "env.py"))
 
pst = pytz.timezone('America/Los_Angeles')
 
# Output location. Defaults to a local "MI_Output" folder next to this script;
# override any of these with environment variables if needed.
OUTPUT_DIR = os.getenv("MI_OUTPUT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "MI_Output"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

EXCEL_PATH = os.getenv("MI_EXCEL_PATH", os.path.join(OUTPUT_DIR, "Tier1_MajorIncidents.xlsx"))
 
TIER1_EXCEL = os.getenv("MI_TIER1_EXCEL", os.path.join(OUTPUT_DIR, "SendtoSaswat.xlsx"))
TIER1_SHEET = "Major Incidents"
 
# Fetch Major Incidents from this date through now (from 2025 till now).
MI_START_DATE = os.getenv("MI_START_DATE", "2025-01-01")
 
 
AZURE_OPENAI_ENDPOINT = "https://itelemetrytest.openai.azure.com/"
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_KV_SECRET = os.getenv("AZURE_OPENAI_KV_SECRET", "")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
AZURE_OPENAI_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
MAX_WORDS = int(os.getenv("MAX_WORDS", "150"))
 
ADO_ORGANIZATION   = os.getenv("ADO_ORGANIZATION", "PSJH")
ADO_PROJECT        = os.getenv("ADO_PROJECT", "CRCA Services")
ADO_AREA_PATH      = os.getenv("ADO_AREA_PATH", "CRCA\\SI\\Monitoring")
ADO_ITERATION_PATH = os.getenv("ADO_ITERATION_PATH", "CRCA\\2026")
ADO_PAT            = os.getenv("ADO_PERSONAL_ACCESS_TOKEN", "")
ADO_PAT_KV_SECRET  = os.getenv("ADO_PAT_KV_SECRET", "personal-access-token-iTelemetry")
ADO_DRY_RUN        = os.getenv("ADO_DRY_RUN", "true").strip().lower() == "true"
 
SUMMARY_COLUMN = "Summary"
CATEGORY_COLUMN = "Category"
 
CATEGORY_RULES = {
    "Server": "Root cause is server CPU, memory, disk utilization, or another server operating/resource condition.",
    "Load Balancer": "Root cause is a load balancer issue.",
    "Database": "Root cause is database DTU, database CPU, database storage, SQL, or another database condition.",
    "Service": "Root cause is a service being stopped, down, hung, or requiring restart.",
    "Network": "Root cause is firewall, route table, subnet, VNet, traffic, connectivity, or network outage.",
    "Vitals Not Flowing - Epic": "Root cause is vitals not flowing to or from Epic, not merely that Epic was impacted.",
    "Vendor": "Root cause required a vendor repair, fix, or intervention.",
    "Biomed": "Root cause is a Biomed-owned issue.",
    "Citrix": "Root cause is Citrix itself, not merely that Citrix users were impacted.",
    "Filestorage": "Root cause is fileshare or Azure filestorage utilization, outage, or storage issue.",
    "Certificate/Secrets/Keyvault Password Expiry": "Root cause is Venafi certificate expiry, Key Vault secret expiry, service account password expiry, or related credential expiry.",
    "Change Req": "Root cause is a scheduled change request, CHG record, firmware upgrade, or planned change activity.",
    "Interface": "Root cause is interface high queue depth, interface not connected, simulated interface, or interface failure.",
    "Azure Outage": "Root cause is an Azure platform or whole-region outage.",
    "Others": "Root cause does not fit any category above.",
}
CATEGORIES = list(CATEGORY_RULES)
TRAINING_CATEGORY_ALIASES = {
    "change": "Change Req",
    "change req": "Change Req",
    "change request": "Change Req",
    "citrix": "Citrix",
    "dns is prolly network?": "Network",
    "interface": "Interface",
    "interface?": "Interface",
    "network": "Network",
    "network?": "Network",
    "service": "Service",
    "server": "Server",
    "vendor": "Vendor",
}
 
_openai_client = None
 
 
def normalize_azure_endpoint(endpoint):
    endpoint = endpoint.strip().rstrip("/")
    if endpoint.endswith("/openai/v1"):
        endpoint = endpoint.removesuffix("/openai/v1")
    return f"{endpoint}/"
 
 
def get_openai_api_key():
    """API key from env var, or Key Vault if AZURE_OPENAI_KV_SECRET is set."""
    if AZURE_OPENAI_API_KEY:
        return AZURE_OPENAI_API_KEY
    if AZURE_OPENAI_KV_SECRET:
        try:
            return connectToKeyVault(AZURE_OPENAI_KV_SECRET)
        except Exception as e:
            print(f"  ⚠️  Could not fetch OpenAI key from Key Vault: {e}")
    return None
 
 
def get_openai_client():
    """Lazily build the Azure OpenAI client (so the script doesn't fail at import)."""
    global _openai_client
    if _openai_client is None:
        api_key = get_openai_api_key()
        if not api_key:
            raise RuntimeError(
                "Azure OpenAI API key not configured. Set AZURE_OPENAI_API_KEY or AZURE_OPENAI_KV_SECRET."
            )
        _openai_client = AzureOpenAI(
            azure_endpoint=normalize_azure_endpoint(AZURE_OPENAI_ENDPOINT),
            api_key=api_key,
            api_version=AZURE_OPENAI_API_VERSION,
        )
    return _openai_client
 
 
def normalize_category(category):
    category = str(category).strip()
    if category in CATEGORIES:
        return category
    return TRAINING_CATEGORY_ALIASES.get(category.lower())
 
 
def summarize_and_categorize_text(text):
    """Summarize an incident and classify its root cause into exactly one allowed category."""
    text = str(text).strip()
    if not text:
        return {SUMMARY_COLUMN: "", CATEGORY_COLUMN: "Others"}
 
    category_list = "\n".join(f"- {name}: {desc}" for name, desc in CATEGORY_RULES.items())
 
    prompt = f"""
Summarize the following major incident text in under {MAX_WORDS} words and assign the SINGLE most accurate root-cause category.
 
Classify semantically by the actual root cause(s) of the MI. Do not classify by impacted applications, users, symptoms, or downstream effects.
 
The text is labeled by section. Use [ROOT CAUSE] and [ROOT CAUSE - RCA Attachment] sections as authoritative when choosing the categories. Use the [CONTEXT / IMPACT] (Description) section mainly to name affected components — not to choose the category.
 
Prefer EXACTLY ONE category — the primary/dominant root cause. Only return a SECOND category when the incident genuinely has two distinct root causes that BOTH had to be fixed (this is rare). Never return more than two.
 
Examples where two categories are justified (only because both were truly root causes):
- An expired certificate that was being handled via a change request → "Certificate/Secrets/Keyvault Password Expiry" AND "Change Req".
- Under-provisioned database servers requiring BOTH database scaling AND application-server resizing → "Database" AND "Server".
Otherwise, pick the single best category.
 
Special rule for change requests: when the root cause is a "Change Request", ALSO return the category of the component the change affected or broke (e.g. Server, Database, Network, Interface, Service). Examples: for a configuration change → ["Change Req", "Configuration"] a change request that misconfigured a server → ["Change Req", "Server"]; a change request that broke a database → ["Change Req", "Database"]. If the affected component is unclear, return just ["Change Req"].
 
In the SUMMARY, always name the affected component(s) when present — e.g. the server name, database/instance name, service name, interface name, load balancer, certificate CN, or change request number (e.g. CHG032767).
 
Classification guidance:
- A memory / CPU / disk / reboot issue on a DATABASE server (Oracle, SQL, etc.) is "Database", NOT "Server".
- "Server" applies to non-database application/OS servers (CPU, memory, disk, reboot, resource conditions).
- Routing, asymmetric routing, ASN, firewall, subnet, VNet, or connectivity problems are "Network", even when fixed via a firewall or routing-policy change.
 
Choosing "Others":
- Only assign a listed category when the root cause CLEARLY and specifically matches that category's definition.
- If the root cause is any device, technology, component, vendor system, or condition that is not explicitly covered by one of the listed categories, classify it as "Others".
- Do NOT force-fit an unrelated root cause into a near-sounding category from superficial keyword overlap. A merely suspected or "potential" link is not enough — the text must confirm that category is the actual root cause.
 Components such as MOXA devices, IIS, Hypervisor / ESXi / VMware, DNS appliances / Windows-update glitches, or unlisted third-party / SaaS / vendor platforms are "Others" unless the text confirms a specific listed root cause.
- When in doubt, choose "Others".
 
Root-cause categories:
{category_list}
 
Return only valid JSON in this format (usually one category):
{{"summary":"...","categories":["..."]}}
 
Each category must exactly match one category name from the list above.
 
Text:
{text}
"""
 
    try:
        response = get_openai_client().chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You summarize incident records, name the affected components, and classify the root cause(s) into one or more allowed categories.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=400,
        )
    except AuthenticationError as error:
        raise RuntimeError(
            "Azure OpenAI authentication failed. Use a key copied from the same "
            "Azure OpenAI resource as AZURE_OPENAI_ENDPOINT."
        ) from error
 
    content = response.choices[0].message.content.strip()
    start = content.find("{")
    end = content.rfind("}") + 1
    if start == -1 or end == 0:
        return {SUMMARY_COLUMN: content, CATEGORY_COLUMN: "Others"}
 
    try:
        result = json.loads(content[start:end])
    except json.JSONDecodeError:
        return {SUMMARY_COLUMN: content, CATEGORY_COLUMN: "Others"}
 
    raw_categories = result.get("categories")
    if raw_categories is None:
        raw_categories = result.get("category", "Others")
    if isinstance(raw_categories, str):
        raw_categories = [raw_categories]
 
    normalized = []
    for c in raw_categories:
        nc = normalize_category(c)
        if nc and nc not in normalized:
            normalized.append(nc)
    if not normalized:
        normalized = ["Others"]
 
    if "Change Req" in normalized:
        components = [c for c in normalized if c != "Change Req"]
        category_value = "Change Req - " + ", ".join(components) if components else "Change Req"
    else:
        category_value = ", ".join(normalized)
 
    return {
        SUMMARY_COLUMN: result.get("summary", "").strip(),
        CATEGORY_COLUMN: category_value,
    }
 
 
def build_incident_text(incident_row, extracted_text=""):
    """Label fields by authority: Cause/CausedBy + RCA attachment drive the category; Description is context only."""
    parts = []
    for col in ("Cause", "CausedBy"):
        val = incident_row.get(col)
        if val is not None and str(val).strip() and str(val).strip().lower() != "nan":
            parts.append(f"[ROOT CAUSE] {col}:\n{str(val).strip()}")
    if extracted_text and str(extracted_text).strip():
        parts.append(f"[ROOT CAUSE - RCA Attachment]:\n{str(extracted_text).strip()}")
    desc = incident_row.get("Description")
    if desc is not None and str(desc).strip() and str(desc).strip().lower() != "nan":
        parts.append(f"[CONTEXT / IMPACT] Description:\n{str(desc).strip()}")
    return "\n\n".join(parts)
 
 
def get_ado_pat():
    """ADO Personal Access Token from env var, or Key Vault fallback."""
    if ADO_PAT:
        return ADO_PAT
    try:
        return connectToKeyVault(ADO_PAT_KV_SECRET)
    except Exception as e:
        print(f"  ⚠️  Could not fetch ADO PAT from Key Vault: {e}")
        return None
 
 
def create_user_story(incident_number, summary):
    """Create an Azure DevOps 'User Story' titled 'Opportunity - <INC>' for an 'Others' incident."""
    title = f"Opportunity - {incident_number}"
    description = (
        f"<b>Incident Number:</b> {incident_number}<br/><br/>"
        f"<b>Summary:</b><br/>{summary}"
    )
 
    request_body = [
        {"op": "add", "path": "/fields/System.Title", "value": title},
        {"op": "add", "path": "/fields/System.Description", "value": description},
        {"op": "add", "path": "/fields/System.AreaPath", "value": ADO_AREA_PATH},
        {"op": "add", "path": "/fields/System.IterationPath", "value": ADO_ITERATION_PATH},
    ]
 
    if ADO_DRY_RUN:
        print(f"  [DRY RUN] Would create User Story '{title}' "
              f"(Area: {ADO_AREA_PATH}, Iteration: {ADO_ITERATION_PATH})")
        print(f"            Summary: {summary}")
        return None
 
    pat = get_ado_pat()
    if not pat:
        print("  ⚠️  No ADO PAT configured — skipping user story creation.")
        return None
 
    base_url = (
        f"https://dev.azure.com/{ADO_ORGANIZATION}/{ADO_PROJECT}"
        f"/_apis/wit/workitems/$User Story?api-version=6.0"
    )
    headers = {
        "Content-Type": "application/json-patch+json",
        "Authorization": "Basic " + base64.b64encode(f":{pat}".encode()).decode(),
    }
 
    response = requests.post(base_url, json=request_body, headers=headers)
    if response.status_code in (200, 201):
        story = json.loads(response.content.decode())
        print(f"  ✓ User Story created: ID {story['id']} — '{title}'")
        return story["id"]
 
    print(f"  ✗ Failed to create User Story for {incident_number}: "
          f"{response.status_code} {response.text}")
    return None
 
 
def create_user_stories_for_others(df, limit=None):
    """Create ADO User Stories for incidents categorized as 'Others' (optionally capped by limit)."""
    def is_others(c):
        return "Others" in [x.strip() for x in str(c).split(",")]
 
    others = df[df[CATEGORY_COLUMN].apply(is_others)]
    if others.empty:
        print("\nNo 'Others' incidents — no user stories to create.")
        return
 
    if limit is not None:
        others = others.head(limit)
 
    print(f"\n{'=' * 70}")
    print(f"  Creating {len(others)} User Story(ies) for 'Others' incidents "
          f"{'[DRY RUN]' if ADO_DRY_RUN else ''}...")
    print("=" * 70)
    for _, row in others.iterrows():
        create_user_story(str(row["Number"]), str(row[SUMMARY_COLUMN]))
 
 
def get_all_applications():
    """Fetch all applications from crcamonitoring.[Application List]."""
    conn = connectToDw_AADpwd(
        "sqldb-azure-prod-012.database.windows.net",
        "crcamonitoring",
        "servCRCAMonitoring@providence.org"
    )
    query = """
        SELECT [Application CI], [Application Family], [APM Number],
               [Support Group], [Managed By Group], [Recovery Ranking]
        FROM [dbo].[Application List]
    """
    rows = queryDw(conn, query)
    if not rows:
        print("No applications found.")
        return pd.DataFrame(columns=["APMNumber", "AppCI", "AppFamily", "SupportGroup", "ManagedByGroup"])
 
    df = pd.DataFrame(np.array(rows), columns=["AppCI", "AppFamily", "APMNumber", "SupportGroup", "ManagedByGroup", "RecoveryRanking"])
    df["AppCI_lower"] = df["AppCI"].str.lower().str.strip()
    print(f"Found {len(df)} applications.")
    return df
 
 
def get_major_incidents_for_apps(app_ci_list, start_date=MI_START_DATE):
    """Fetch Major Incidents from vw_SN_incident for the given app CIs (opened since start_date)."""
    conn = connectToDw_SqlServerPwd(
        "spidedbsv6c6b60.wa.providence.org\\SPIDER",
        "ServicePerf_DW",
        "servCRCAMonitor"
    )

    in_clause = ",".join([f"'{ci.lower().strip()}'" for ci in app_ci_list])
    opened_since = f"{start_date} 00:00:00"

    query = f"""
        SELECT
            number,
            cmdb_ci_label,
            description,
            opened_at,
            resolved_at,
            cause,
            caused_by,
            severity_label
        FROM [ServicePerf_DW].[dbo].[vw_SN_incident]
        WHERE
        (
            (
                major_incident_state LIKE 'Accepted'
                AND [active] like 'true'
                AND [state_label_1] NOT IN ('Closed', 'Resolved')
            )
            OR
            (
                major_incident_state LIKE 'Accepted'
                AND [state_label_1] IN ('Closed', 'Resolved')
                AND opened_at >= '{opened_since}'
            )
        )
        AND LOWER(LTRIM(RTRIM(cmdb_ci_label))) IN ({in_clause})
        AND (
        LOWER(cmdb_ci_label) LIKE '%avasure%'
        OR LOWER(cmdb_ci_label) LIKE '%patient safety net%'
        OR LOWER(cmdb_ci_label) LIKE '%philips%'
        OR LOWER(cmdb_ci_label) LIKE '%sotera visi%'
        OR LOWER(cmdb_ci_label) LIKE '%space%'
        OR LOWER(cmdb_ci_label) LIKE '%syngo%'
        OR LOWER(cmdb_ci_label) LIKE '%ge carescape%'
        OR LOWER(cmdb_ci_label) LIKE '%deviceconx%'
        OR LOWER(cmdb_ci_label) LIKE '%mosaiq%'
        OR LOWER(cmdb_ci_label) LIKE '%wellsky transfusion%'
        OR LOWER(cmdb_ci_label) LIKE '%change healthcare cardiology%'
        OR LOWER(cmdb_ci_label) LIKE '%acuo%'
        OR LOWER(cmdb_ci_label) LIKE '%synapse pacs%'
        OR LOWER(cmdb_ci_label) LIKE '%obix%')
    """
 
    print("  Executing query:")
    print(query)
 
    rows = queryDw(conn, query)
    if not rows:
        print("No Major Incidents found for the applications.")
        return pd.DataFrame()
 
    df = pd.DataFrame(np.array(rows), columns=[
        "Number", "AppCI", "Description", "OpenedAt", "ResolvedAt", "Cause", "CausedBy", "Severity"
    ])
    print(f"Found {len(df)} Major Incidents for the applications.")
    return df
 
 
def clean_for_excel(value):
    """Strip control chars openpyxl rejects and cap to Excel's 32767-char cell limit."""
    if value is None:
        return None
    s = ILLEGAL_CHARACTERS_RE.sub("", str(value))
    return s[:32767]
 
 
def add_summary_to_excel(excel_path, summary_map, sheet_name="Major Incidents"):
    """Add Summary/Category columns into the existing sheet in place (rows preserved)."""
    wb = load_workbook(excel_path)
    ws = wb[sheet_name] if sheet_name in wb.sheetnames else wb.active
 
    header = [c.value for c in ws[1]]
    num_col = header.index("Number") + 1
    next_col = len(header) + 1
    summary_col = (header.index(SUMMARY_COLUMN) + 1) if SUMMARY_COLUMN in header else next_col
    if SUMMARY_COLUMN not in header:
        next_col += 1
    category_col = (header.index(CATEGORY_COLUMN) + 1) if CATEGORY_COLUMN in header else next_col
 
    ws.cell(row=1, column=summary_col, value=SUMMARY_COLUMN)
    ws.cell(row=1, column=category_col, value=CATEGORY_COLUMN)
    for r in range(2, ws.max_row + 1):
        num = str(ws.cell(row=r, column=num_col).value)
        if num in summary_map:
            ws.cell(row=r, column=summary_col, value=clean_for_excel(summary_map[num][SUMMARY_COLUMN]))
            ws.cell(row=r, column=category_col, value=clean_for_excel(summary_map[num][CATEGORY_COLUMN]))
 
    wb.save(excel_path)
    print(f"✓ Added Summary & Category to existing sheet: {excel_path}")
 
 
def summarize_existing_excel(excel_path=TIER1_EXCEL, sheet_name=TIER1_SHEET):
    """Summarize + categorize an existing MI Excel and write results to a NEW output file."""
    print("=" * 70)
    print(f"  Summarizing existing Excel: {excel_path}")
    print("=" * 70)
 
    df = pd.read_excel(excel_path, sheet_name=sheet_name, engine="openpyxl")
    if "Number" not in df.columns:
        raise ValueError(f"'Number' column not found. Available: {', '.join(df.columns.astype(str))}")
 
    has_extracted = "ExtractedText" in df.columns
    rows = df.to_dict("records")
    summaries, categories = [], []
    for i, row in enumerate(rows, 1):
        num = str(row["Number"])
        extracted = row.get("ExtractedText", "") if has_extracted else ""
        combined = build_incident_text(row, extracted)
        print(f"  Summarizing {i}/{len(rows)}: {num}")
        try:
            result = summarize_and_categorize_text(combined)
        except Exception as e:
            print(f"    ✗ Summarization failed for {num}: {e}")
            result = {SUMMARY_COLUMN: "", CATEGORY_COLUMN: "Others"}
        summaries.append(result[SUMMARY_COLUMN])
        categories.append(result[CATEGORY_COLUMN])
 
    df[SUMMARY_COLUMN] = summaries
    df[CATEGORY_COLUMN] = categories
 
    create_user_stories_for_others(df, limit=1)
 
    for col in df.columns:
        df[col] = df[col].map(clean_for_excel)
    output_dir = os.path.dirname(excel_path)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = os.path.join(output_dir, f"MajorIncidents_Summarized_{timestamp}.xlsx")
    df.to_excel(output_path, index=False, sheet_name="Summarized")
    print(f"\n✓ Done — wrote {len(df)} summarized rows to NEW file: {output_path}")
 
 
def main():
    print("=" * 70)
    print("  Fetching Applications...")
    print("=" * 70)
    apps_df = get_all_applications()
    if apps_df.empty:
        return
    app_ci_list = apps_df["AppCI_lower"].dropna().unique().tolist()
    print(f"  App CIs: {len(app_ci_list)}")
 
    print(f"\n{'=' * 70}")
    print("  Fetching Major Incidents for Apps...")
    print("=" * 70)
    mi_df = get_major_incidents_for_apps(app_ci_list, start_date=MI_START_DATE)
    if mi_df.empty:
        return
 
    result = mi_df[["Number", "AppCI", "Description", "OpenedAt", "ResolvedAt", "Cause", "CausedBy"]].copy()
    result["OpenedAt"] = pd.to_datetime(result["OpenedAt"], errors="coerce")
    result = result.sort_values("OpenedAt", ascending=False).reset_index(drop=True)
 
    print(f"\n  Total MI records: {len(result)}")
    print(result[["Number", "AppCI", "Description", "OpenedAt", "ResolvedAt"]].head(20).to_string(index=False))
 
    result.to_excel(EXCEL_PATH, index=False, sheet_name="Major Incidents")
    print(f"\n✓ Exported {len(result)} MI rows to {EXCEL_PATH}")
 
    print(f"\n{'=' * 70}")
    print("  Summarizing & categorizing incidents...")
    print("=" * 70)
    incidents = result.to_dict("records")
    summaries, categories = [], []
    for i, inc in enumerate(incidents, 1):
        num = str(inc["Number"])
        combined = build_incident_text(inc, "")
        print(f"  Summarizing {i}/{len(incidents)}: {num}")
        try:
            res = summarize_and_categorize_text(combined)
        except Exception as e:
            print(f"    ✗ Summarization failed for {num}: {e}")
            res = {SUMMARY_COLUMN: "", CATEGORY_COLUMN: "Others"}
        summaries.append(res[SUMMARY_COLUMN])
        categories.append(res[CATEGORY_COLUMN])
 
    result[SUMMARY_COLUMN] = summaries
    result[CATEGORY_COLUMN] = categories
 
    # Write the full DataFrame with all columns at once
    for col in result.columns:
        result[col] = result[col].map(clean_for_excel)
    result.to_excel(EXCEL_PATH, index=False, sheet_name="Major Incidents")
    print(f"\n✓ Final Excel with all columns written to: {EXCEL_PATH}")
 
    create_user_stories_for_others(result, limit=1)
 
 
if __name__ == "__main__":
    main()